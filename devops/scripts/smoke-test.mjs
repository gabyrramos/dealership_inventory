#!/usr/bin/env node
// Smoke test against a running app (wrangler dev or the deployed URL). No dependencies.
// Puts back any data it changes. Exits 1 if any check fails.
//
//   node --env-file=backend/.env devops/scripts/smoke-test.mjs
//   BASE_URL=https://... DEMO_PASSWORD=... node devops/scripts/smoke-test.mjs
//
// BASE_URL defaults to http://localhost:8787. Set EXPECT_RELEASE to a git SHA to also
// check that /api/health reports it.
import { appendFileSync } from 'node:fs'

const BASE = (process.env.BASE_URL || 'http://localhost:8787').replace(/\/+$/, '')
const PASSWORD = process.env.DEMO_PASSWORD
if (!PASSWORD) {
  console.error('DEMO_PASSWORD is not set.')
  process.exit(2)
}
const EXPECT_RELEASE = process.env.EXPECT_RELEASE
const OTHER_DEALERSHIP_VEHICLE = 'veh_lakeside_001'

const results = []
let failed = false

async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail: detail ?? '' })
    console.log(`  \u2713 ${name}${detail ? ` \u2014 ${detail}` : ''}`)
  } catch (error) {
    failed = true
    results.push({ name, ok: false, detail: error.message })
    console.log(`  \u2717 ${name}\n      ${error.message}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function call(method, path, { cookie, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json, text, headers: res.headers }
}

async function login(email) {
  const res = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } })
  assert(res.status === 200, `login ${email} expected 200, got ${res.status} ${res.text.slice(0, 200)}`)
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('dealer_session='))
  assert(cookie, 'login did not set the dealer_session cookie')
  return cookie
}

const editable = (v) => ({ make: v.make, model: v.model, year: v.year, status: v.status })
const put = (cookie, id, fields, version) => call('PUT', `/api/vehicles/${id}`, { cookie, body: { ...fields, version } })

console.log(`Smoke test against ${BASE}\n`)

let admin1
let admin2
let viewer
let target
let original

await check('health endpoint is up and exposes no secrets', async () => {
  const res = await call('GET', '/api/health')
  assert(res.status === 200, `expected 200, got ${res.status} (${res.text.slice(0, 120)})`)
  assert(res.json.status === 'ok' && res.json.database === 'ok', `unexpected body ${res.text}`)
  assert(JSON.stringify(Object.keys(res.json).sort()) === JSON.stringify(['database', 'release', 'status', 'time']), `unexpected keys ${Object.keys(res.json)}`)
  if (EXPECT_RELEASE) assert(res.json.release === EXPECT_RELEASE, `release is "${res.json.release}", expected "${EXPECT_RELEASE}"`)
  return `release ${res.json.release}`
})

await check('frontend is served, including client-side routes', async () => {
  for (const path of ['/', '/vehicles', '/vehicles/veh_sunrise_001']) {
    const res = await call('GET', path)
    assert(res.status === 200, `${path} expected 200, got ${res.status}`)
    assert((res.headers.get('content-type') ?? '').includes('text/html'), `${path} is not HTML`)
  }
})

await check('unauthenticated API request is rejected (401)', async () => {
  const res = await call('GET', '/api/vehicles')
  assert(res.status === 401, `expected 401, got ${res.status}`)
})

await check('invalid credentials are rejected (401, generic message)', async () => {
  const res = await call('POST', '/api/auth/login', { body: { email: 'admin1@sunrise.test', password: 'definitely-wrong' } })
  assert(res.status === 401 && res.json?.error?.code === 'invalid_credentials', `got ${res.status} ${res.text.slice(0, 120)}`)
})

await check('login works for both Sunrise administrators and the viewer', async () => {
  admin1 = await login('admin1@sunrise.test')
  admin2 = await login('admin2@sunrise.test')
  viewer = await login('viewer@sunrise.test')
})

await check('vehicle list is scoped to the signed-in dealership', async () => {
  const res = await call('GET', '/api/vehicles', { cookie: admin1 })
  assert(res.status === 200, `expected 200, got ${res.status}`)
  const { vehicles } = res.json
  assert(vehicles.length >= 3, `expected at least 3 vehicles, got ${vehicles.length}`)
  assert(vehicles.every((v) => v.dealershipId === 'dlr_sunrise'), 'list contains another dealership\'s vehicle')
  target = vehicles[0]
  original = { ...editable(target), version: target.version }
  return `${vehicles.length} vehicles`
})

await check('administrator update is accepted and the version advances by one', async () => {
  const changed = { ...editable(target), model: `${target.model.slice(0, 30)} (smoke)` }
  const res = await put(admin1, target.id, changed, target.version)
  assert(res.status === 200, `expected 200, got ${res.status} ${res.text.slice(0, 200)}`)
  assert(res.json.vehicle.version === target.version + 1, `version ${res.json.vehicle.version}, expected ${target.version + 1}`)
  const reread = await call('GET', `/api/vehicles/${target.id}`, { cookie: admin2 })
  assert(reread.json.vehicle.model === changed.model, 'update did not persist (not visible to the other admin)')
  target = reread.json.vehicle
  return `now v${target.version}`
})

await check('stale edit from the old version gets 409 and changes nothing', async () => {
  const stale = await put(admin2, target.id, { ...editable(target), make: 'StaleOverwrite' }, original.version)
  assert(stale.status === 409, `expected 409, got ${stale.status} ${stale.text.slice(0, 200)}`)
  assert(stale.json.error.code === 'conflict', `code ${stale.json.error.code}`)
  const after = await call('GET', `/api/vehicles/${target.id}`, { cookie: admin1 })
  assert(JSON.stringify(after.json.vehicle) === JSON.stringify(target), 'a rejected stale edit changed the stored vehicle')
})

await check('two simultaneous edits from the same version: exactly one 200 and one 409', async () => {
  const fresh = (await call('GET', `/api/vehicles/${target.id}`, { cookie: admin1 })).json.vehicle
  const [a, b] = await Promise.all([
    put(admin1, fresh.id, { ...editable(fresh), make: 'RaceA' }, fresh.version),
    put(admin2, fresh.id, { ...editable(fresh), make: 'RaceB' }, fresh.version),
  ])
  const statuses = [a.status, b.status].sort()
  assert(JSON.stringify(statuses) === '[200,409]', `expected [200,409], got [${statuses}]`)
  const winner = a.status === 200 ? 'RaceA' : 'RaceB'
  const final = (await call('GET', `/api/vehicles/${fresh.id}`, { cookie: admin1 })).json.vehicle
  assert(final.make === winner, `stored make "${final.make}", expected winner "${winner}"`)
  assert(final.version === fresh.version + 1, `version ${final.version}, expected ${fresh.version + 1}`)
  target = final
  return `winner ${winner}`
})

await check('viewer edit is rejected (403) and changes nothing', async () => {
  const res = await put(viewer, target.id, { ...editable(target), make: 'ViewerHack' }, target.version)
  assert(res.status === 403, `expected 403, got ${res.status}`)
  const after = (await call('GET', `/api/vehicles/${target.id}`, { cookie: admin1 })).json.vehicle
  assert(JSON.stringify(after) === JSON.stringify(target), 'a rejected viewer edit changed the vehicle')
})

await check('cross-dealership read and update are rejected (404)', async () => {
  const read = await call('GET', `/api/vehicles/${OTHER_DEALERSHIP_VEHICLE}`, { cookie: admin1 })
  assert(read.status === 404, `read expected 404, got ${read.status}`)
  const write = await put(admin1, OTHER_DEALERSHIP_VEHICLE, { make: 'Hijack', model: 'X', year: 2020, status: 'sold' }, 1)
  assert(write.status === 404, `update expected 404, got ${write.status}`)
})

await check('cleanup: original vehicle values restored', async () => {
  const current = (await call('GET', `/api/vehicles/${target.id}`, { cookie: admin1 })).json.vehicle
  const res = await put(admin1, target.id, editable(original), current.version)
  assert(res.status === 200, `expected 200, got ${res.status}`)
})

await check('logout invalidates the session server-side', async () => {
  const out = await call('POST', '/api/auth/logout', { cookie: admin1 })
  assert(out.status === 200, `logout expected 200, got ${out.status}`)
  const reuse = await call('GET', '/api/vehicles', { cookie: admin1 })
  assert(reuse.status === 401, `old cookie expected 401, got ${reuse.status}`)
})

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} checks passed against ${BASE}`)

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results.map((r) => `| ${r.ok ? '\u2705' : '\u274c'} | ${r.name} | ${String(r.detail).replaceAll('|', '\\|')} |`)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Smoke test: ${failed ? 'FAILED' : 'passed'}\n\n${BASE}\n\n| | Check | Detail |\n|---|---|---|\n${rows.join('\n')}\n`,
  )
}

process.exit(failed ? 1 : 0)
