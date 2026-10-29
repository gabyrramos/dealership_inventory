import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { DEFAULT_SESSION_TTL_SECONDS, SESSION_COOKIE } from '../constants/auth'
import type { AppEnv, AuthContext } from '../env'
import { parseBody } from '../lib/http'
import { requireAuth } from '../middleware/auth'
import { loginSchema } from '../schemas'
import { loginUser, logoutUser } from '../services/auth'

function getSessionTtl(env: { SESSION_TTL_SECONDS?: string }): number {
  const ttl = Number(env.SESSION_TTL_SECONDS)
  if (Number.isInteger(ttl) && ttl > 0) {
    return ttl
  }
  return DEFAULT_SESSION_TTL_SECONDS
}

function userView(auth: AuthContext) {
  return {
    id: auth.userId,
    email: auth.email,
    name: auth.name,
    role: auth.role,
    dealership: { id: auth.dealershipId, name: auth.dealershipName },
  }
}

export function authController() {
  const r = new Hono<AppEnv>()

  r.post('/login', async (c) => {
    const { email, password } = await parseBody(c, loginSchema)
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    const ttl = getSessionTtl(c.env)

    const { user, token } = await loginUser(c.env.DB, { email, password, ip }, ttl)

    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true, // JavaScript can't read this cookie
      secure: new URL(c.req.url).protocol === 'https:', // http is allowed on localhost
      sameSite: 'Lax',
      path: '/',
      maxAge: ttl,
    })

    return c.json({
      user: userView({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        dealershipId: user.dealershipId,
        dealershipName: user.dealershipName,
      }),
    })
  })


  r.post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (token) await logoutUser(c.env.DB, token)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  r.get('/me', requireAuth, (c) => c.json({ user: userView(c.get('auth')) }))

  return r
}
