import { ATTEMPT_WINDOW_SECONDS, MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_IP } from '../constants/auth'
import { DUMMY_PASSWORD_HASH } from '../constants/password'
import { ApiError } from '../lib/http'
import { verifyPassword } from '../lib/password'
import { nowSeconds } from '../lib/time'
import { generateSessionToken, sha256Hex } from '../lib/tokens'
import { blockedFor, clearAttempts, recordFailure } from '../repositories/login-attempts'
import { createSession, deleteSession } from '../repositories/sessions'
import { findUserByEmail } from '../repositories/users'

type LoginInput = { email: string; password: string; ip: string }

export async function loginUser(db: D1Database, input: LoginInput, sessionTtlSeconds: number) {
  const { email, password, ip } = input

  // Rate limit: too many failed logins for this IP or this email means we stop checking passwords.
  const ipKey = `ip:${ip}`
  const emailKey = `email:${await sha256Hex(email)}`
  const now = nowSeconds()

  const ipWait = await blockedFor(db, ipKey, MAX_FAILURES_PER_IP, now, ATTEMPT_WINDOW_SECONDS)
  const emailWait = await blockedFor(db, emailKey, MAX_FAILURES_PER_EMAIL, now, ATTEMPT_WINDOW_SECONDS)
  const wait = Math.max(ipWait, emailWait)
  if (wait > 0) {
    throw new ApiError(429, 'rate_limited', 'Too many failed sign-in attempts. Try again later.', {
      retryAfterSeconds: wait,
    })
  }

  const user = await findUserByEmail(db, email)

  // If the email doesn't exist we still check a fake hash, so the response takes the same time.
  let passwordOk = false
  if (user) {
    passwordOk = await verifyPassword(password, user.passwordHash)
  } else {
    await verifyPassword(password, DUMMY_PASSWORD_HASH)
  }

  if (!user || !passwordOk) {
    await recordFailure(db, [ipKey, emailKey], now, ATTEMPT_WINDOW_SECONDS)
    throw new ApiError(401, 'invalid_credentials', 'Incorrect email or password.')
  }
  await clearAttempts(db, emailKey)

  const token = generateSessionToken()
  await createSession(db, await sha256Hex(token), user.id, nowSeconds(), sessionTtlSeconds)

  return { user, token }
}

export async function logoutUser(db: D1Database, token: string) {
  await deleteSession(db, await sha256Hex(token))
}
