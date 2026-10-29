#!/usr/bin/env node
// Polls /api/health until it reports EXPECT_RELEASE, so we know the new build is live.
//
//   BASE_URL=https://... EXPECT_RELEASE=<sha> node devops/scripts/wait-for-release.mjs
//
// ATTEMPTS (default 20) and DELAY_SECONDS (default 3) are optional.
const base = (process.env.BASE_URL || '').replace(/\/+$/, '')
const expected = process.env.EXPECT_RELEASE
const attempts = Number(process.env.ATTEMPTS || 20)
const delayMs = Number(process.env.DELAY_SECONDS || 3) * 1000

if (!base || !expected) {
  console.error('BASE_URL and EXPECT_RELEASE are required.')
  process.exit(2)
}

let last = 'no response'
for (let i = 1; i <= attempts; i++) {
  try {
    const res = await fetch(`${base}/api/health`, { headers: { 'cache-control': 'no-cache' } })
    const body = await res.json().catch(() => null)
    last = `HTTP ${res.status} ${body ? JSON.stringify(body) : '(non-JSON body)'}`
    if (res.status === 200 && body?.status === 'ok' && body?.release === expected) {
      console.log(`Healthy on attempt ${i}: ${last}`)
      process.exit(0)
    }
  } catch (error) {
    last = `request failed: ${error.message}`
  }
  console.log(`Attempt ${i}/${attempts}: ${last}`)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}
console.error(`Deployment never reported release ${expected}. Last result: ${last}`)
process.exit(1)
