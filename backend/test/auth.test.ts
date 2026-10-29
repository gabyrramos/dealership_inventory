import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { ATTEMPT_WINDOW_SECONDS, MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_IP } from '../src/constants/auth'
import { PASSWORD, USERS, login, resetDatabase, send } from './support/helpers'

const app = createApp()

describe('POST /api/auth/login', () => {
  beforeEach(resetDatabase)

  it('signs in with valid credentials and sets a hardened session cookie', async () => {
    const res = await send(app, 'POST', '/api/auth/login', { body: { email: USERS.sunriseAdmin1, password: PASSWORD } })
    expect(res.status).toBe(200)

    const body = (await res.json()) as { user: Record<string, unknown> }
    expect(body.user).toEqual({
      id: 'usr_sunrise_admin1',
      email: USERS.sunriseAdmin1,
      name: 'Alex Admin',
      role: 'admin',
      dealership: { id: 'dlr_sunrise', name: 'Sunrise Motors' },
    })
    expect(JSON.stringify(body)).not.toContain('pbkdf2') // never leak the password hash

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('dealer_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
  })

  it('stores only a hash of the session token, never the token itself', async () => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    const token = cookie.split('=')[1]
    const { results } = await env.DB.prepare('SELECT token_hash FROM sessions').all<{ token_hash: string }>()
    expect(results).toHaveLength(1)
    expect(results[0].token_hash).not.toBe(token)
    expect(results[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('treats the email case-insensitively', async () => {
    const res = await send(app, 'POST', '/api/auth/login', {
      body: { email: 'ADMIN1@Sunrise.TEST', password: PASSWORD },
    })
    expect(res.status).toBe(200)
  })

  it('rejects a wrong password with a generic message', async () => {
    const res = await send(app, 'POST', '/api/auth/login', { body: { email: USERS.sunriseAdmin1, password: 'nope' } })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('invalid_credentials')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('gives the identical response for an unknown email (no user enumeration)', async () => {
    const wrongPassword = await send(app, 'POST', '/api/auth/login', {
      body: { email: USERS.sunriseAdmin1, password: 'nope' },
    })
    const unknownUser = await send(app, 'POST', '/api/auth/login', {
      body: { email: 'ghost@sunrise.test', password: 'nope' },
    })
    expect(unknownUser.status).toBe(401)
    expect(await unknownUser.json()).toEqual(await wrongPassword.json())
  })

  it('rejects malformed input', async () => {
    const missing = await send(app, 'POST', '/api/auth/login', { body: { email: USERS.sunriseAdmin1 } })
    expect(missing.status).toBe(400)
    const badEmail = await send(app, 'POST', '/api/auth/login', { body: { email: 'not-an-email', password: 'x' } })
    expect(badEmail.status).toBe(400)
    const notJson = await send(app, 'POST', '/api/auth/login', { rawBody: '{oops' })
    expect(notJson.status).toBe(400)
  })

  it('refuses non-JSON writes (CSRF defence in depth)', async () => {
    const res = await send(app, 'POST', '/api/auth/login', {
      headers: { 'content-type': 'text/plain' },
      rawBody: JSON.stringify({ email: USERS.sunriseAdmin1, password: PASSWORD }),
    })
    expect(res.status).toBe(415)
  })
})

describe('authentication on protected routes', () => {
  beforeEach(resetDatabase)

  const protectedRequests: [string, string][] = [
    ['GET', '/api/auth/me'],
    ['GET', '/api/vehicles'],
    ['GET', '/api/vehicles/veh_sunrise_001'],
    ['PUT', '/api/vehicles/veh_sunrise_001'],
  ]

  it.each(protectedRequests)('%s %s without a session is 401', async (method, path) => {
    const res = await send(app, method, path, { body: method === 'PUT' ? {} : undefined })
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('unauthenticated')
  })

  it('rejects a forged or garbage session cookie', async () => {
    const res = await send(app, 'GET', '/api/vehicles', { cookie: 'dealer_session=not-a-real-token' })
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('unauthenticated')
  })

  it('accepts a valid session and returns the current user', async () => {
    const cookie = await login(app, USERS.sunriseViewer)
    const res = await send(app, 'GET', '/api/auth/me', { cookie })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { user: { role: string } }).user.role).toBe('viewer')
  })

  it('returns 401 session_expired once the session passes its expiry, and removes it', async () => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    await env.DB.prepare('UPDATE sessions SET expires_at = ?1').bind(Math.floor(Date.now() / 1000) - 1).run()

    const res = await send(app, 'GET', '/api/vehicles', { cookie })
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('session_expired')

    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>()
    expect(left?.n).toBe(0)
  })

  it('logout invalidates the session on the server, so a copied cookie stops working', async () => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    expect((await send(app, 'GET', '/api/vehicles', { cookie })).status).toBe(200)

    const out = await send(app, 'POST', '/api/auth/logout', { cookie, body: {} })
    expect(out.status).toBe(200)

    const after = await send(app, 'GET', '/api/vehicles', { cookie }) // same old cookie
    expect(after.status).toBe(401)
  })

  it('logout is harmless when not signed in', async () => {
    const res = await send(app, 'POST', '/api/auth/logout', { body: {} })
    expect(res.status).toBe(200)
  })

  it('takes effect immediately when a user is demoted (role is read per request)', async () => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    await env.DB.prepare("UPDATE users SET role = 'viewer' WHERE email = ?1").bind(USERS.sunriseAdmin1).run()
    const res = await send(app, 'PUT', '/api/vehicles/veh_sunrise_001', {
      cookie,
      body: { make: 'A', model: 'B', year: 2020, status: 'sold', version: 1 },
    })
    expect(res.status).toBe(403)
  })
})

describe('login rate limiting', () => {
  beforeEach(resetDatabase)

  const attempt = (email: string, password: string, ip?: string) =>
    send(app, 'POST', '/api/auth/login', {
      body: { email, password },
      headers: ip ? { 'cf-connecting-ip': ip } : undefined,
    })

  async function failTimes(email: string, times: number, ip?: string) {
    for (let i = 0; i < times; i++) expect((await attempt(email, 'nope', ip)).status).toBe(401)
  }

  it('blocks an email after too many failures, even with the right password', async () => {
    await failTimes(USERS.sunriseAdmin1, MAX_FAILURES_PER_EMAIL)

    const res = await attempt(USERS.sunriseAdmin1, PASSWORD)
    expect(res.status).toBe(429)
    expect(res.headers.get('set-cookie')).toBeNull()
    const body = (await res.json()) as { error: { code: string; retryAfterSeconds: number } }
    expect(body.error.code).toBe('rate_limited')
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0)
    expect(Number(res.headers.get('retry-after'))).toBe(body.error.retryAfterSeconds)
  })

  it('does not affect other accounts from a different address', async () => {
    await failTimes(USERS.sunriseAdmin1, MAX_FAILURES_PER_EMAIL, '203.0.113.1')
    const res = await attempt(USERS.sunriseViewer, PASSWORD, '203.0.113.2')
    expect(res.status).toBe(200)
  })

  it('counts the email case-insensitively', async () => {
    await failTimes(USERS.sunriseAdmin1, MAX_FAILURES_PER_EMAIL - 1)
    expect((await attempt('ADMIN1@Sunrise.TEST', 'nope')).status).toBe(401)
    expect((await attempt(USERS.sunriseAdmin1, PASSWORD)).status).toBe(429)
  })

  it('counts unknown emails too, without revealing that they are unknown', async () => {
    await failTimes('nobody@sunrise.test', MAX_FAILURES_PER_EMAIL)
    const res = await attempt('nobody@sunrise.test', 'nope')
    expect(res.status).toBe(429)
  })

  it('resets the email counter after a successful sign-in', async () => {
    await failTimes(USERS.sunriseAdmin1, MAX_FAILURES_PER_EMAIL - 1)
    expect((await attempt(USERS.sunriseAdmin1, PASSWORD)).status).toBe(200)
    await failTimes(USERS.sunriseAdmin1, MAX_FAILURES_PER_EMAIL - 1)
  })

  it('blocks an address that tries many different accounts', async () => {
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) {
      expect((await attempt(`user${i}@sunrise.test`, 'nope', '198.51.100.7')).status).toBe(401)
    }
    expect((await attempt(USERS.sunriseViewer, PASSWORD, '198.51.100.7')).status).toBe(429)
    expect((await attempt(USERS.sunriseViewer, PASSWORD, '198.51.100.8')).status).toBe(200)
  })

  it('lets the user back in once the window has passed', async () => {
    await failTimes(USERS.sunriseAdmin1, MAX_FAILURES_PER_EMAIL)
    expect((await attempt(USERS.sunriseAdmin1, PASSWORD)).status).toBe(429)

    await env.DB.prepare('UPDATE login_attempts SET window_start = window_start - ?1')
      .bind(ATTEMPT_WINDOW_SECONDS)
      .run()
    expect((await attempt(USERS.sunriseAdmin1, PASSWORD)).status).toBe(200)
  })

  it('does not count invalid requests that never reach the password check', async () => {
    for (let i = 0; i < MAX_FAILURES_PER_EMAIL + 1; i++) {
      expect((await attempt('not-an-email', 'nope')).status).toBe(400)
    }
    expect((await attempt(USERS.sunriseAdmin1, PASSWORD)).status).toBe(200)
  })
})
