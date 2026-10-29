import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ITERATIONS, DUMMY_PASSWORD_HASH, MAX_ITERATIONS } from '../src/constants/password'
import { hashPassword, verifyPassword } from '../src/lib/password'
import { PASSWORD, resetDatabase } from './support/helpers'

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse', { iterations: 2000 })
    expect(await verifyPassword('correct horse', hash)).toBe(true)
    expect(await verifyPassword('wrong horse', hash)).toBe(false)
  })

  it('uses a random salt, so equal passwords hash differently', async () => {
    const a = await hashPassword('same', { iterations: 2000 })
    const b = await hashPassword('same', { iterations: 2000 })
    expect(a).not.toBe(b)
  })

  it('is deterministic only when a salt is supplied (used by the seed script)', async () => {
    const salt = new Uint8Array(16).fill(1)
    expect(await hashPassword('x', { iterations: 2000, salt })).toBe(await hashPassword('x', { iterations: 2000, salt }))
  })

  it('never throws on malformed stored hashes', async () => {
    for (const bad of ['', 'plain', 'pbkdf2-sha256$abc$x$y', 'bcrypt$10$a$b', 'pbkdf2-sha256$999999999$AA$AA']) {
      expect(await verifyPassword('x', bad)).toBe(false)
    }
  })

  it('refuses iteration counts the Workers runtime would reject', async () => {
    await expect(hashPassword('x', { iterations: MAX_ITERATIONS + 1 })).rejects.toThrow(RangeError)
    await expect(hashPassword('x', { iterations: 10 })).rejects.toThrow(RangeError)
  })

  it('keeps the dummy hash in step with the default iteration count', () => {
    expect(Number(DUMMY_PASSWORD_HASH.split('$')[1])).toBe(DEFAULT_ITERATIONS)
  })
})

describe('seed data', () => {
  beforeEach(resetDatabase)

  it('contains two dealerships, six users (2 admins + 1 viewer each) and 4 vehicles per dealership', async () => {
    const users = await env.DB.prepare(
      'SELECT dealership_id, role, COUNT(*) AS n FROM users GROUP BY dealership_id, role ORDER BY dealership_id, role',
    ).all<{ dealership_id: string; role: string; n: number }>()
    expect(users.results).toEqual([
      { dealership_id: 'dlr_lakeside', role: 'admin', n: 2 },
      { dealership_id: 'dlr_lakeside', role: 'viewer', n: 1 },
      { dealership_id: 'dlr_sunrise', role: 'admin', n: 2 },
      { dealership_id: 'dlr_sunrise', role: 'viewer', n: 1 },
    ])
    const vehicles = await env.DB.prepare(
      'SELECT dealership_id, COUNT(*) AS n FROM vehicles GROUP BY dealership_id ORDER BY dealership_id',
    ).all<{ dealership_id: string; n: number }>()
    expect(vehicles.results).toEqual([
      { dealership_id: 'dlr_lakeside', n: 4 },
      { dealership_id: 'dlr_sunrise', n: 4 },
    ])
  })

  it('stores hashed passwords (never plaintext) that verify against the documented demo password', async () => {
    const { results } = await env.DB.prepare('SELECT email, password_hash FROM users').all<{
      email: string
      password_hash: string
    }>()
    expect(results).toHaveLength(6)
    for (const row of results) {
      expect(row.password_hash).not.toContain(PASSWORD)
      expect(await verifyPassword(PASSWORD, row.password_hash)).toBe(true)
    }
  })

  it('is repeatable: re-running the seed restores the original data', async () => {
    await env.DB.prepare("UPDATE vehicles SET make = 'Tampered', version = 99").run()
    await resetDatabase()
    const row = await env.DB.prepare('SELECT make, version FROM vehicles WHERE id = ?1')
      .bind('veh_sunrise_001')
      .first<{ make: string; version: number }>()
    expect(row).toEqual({ make: 'Toyota', version: 1 })
  })
})
