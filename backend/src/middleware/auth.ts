import { deleteCookie, getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { SESSION_COOKIE } from '../constants/auth'
import type { AppEnv, Role } from '../env'
import { ApiError } from '../lib/http'
import { nowSeconds } from '../lib/time'
import { sha256Hex } from '../lib/tokens'
import { deleteSession, findSession } from '../repositories/sessions'

// Finds the user from the session cookie and puts them on the context.
// Routes should only trust this, never an id from the URL or body.
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.')

  const tokenHash = await sha256Hex(token)
  const found = await findSession(c.env.DB, tokenHash)

  if (!found) {
    // The user logged out, the session was cleaned up, or the cookie is fake.
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    throw new ApiError(401, 'unauthenticated', 'Your session is no longer valid. Sign in again.')
  }

  if (found.expiresAt <= nowSeconds()) {
    await deleteSession(c.env.DB, tokenHash)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    throw new ApiError(401, 'session_expired', 'Your session expired. Sign in again.')
  }

  c.set('auth', found.auth)
  await next()
})

//permission check
export const requireRole = (role: Role) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('auth').role !== role) {
      throw new ApiError(403, 'forbidden', 'Only administrators can make this change.')
    }
    await next()
  })
