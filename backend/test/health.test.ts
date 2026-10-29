import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { resetDatabase, send } from './support/helpers'

describe('health endpoint', () => {
  beforeEach(resetDatabase)

  it('is public, reports ok, and exposes no secrets', async () => {
    const res = await send(createApp(), 'GET', '/api/health')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['database', 'release', 'status', 'time'])
    expect(body.status).toBe('ok')
    expect(body.database).toBe('ok')
    expect(body.release).toBe('test')
  })

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await send(createApp(), 'GET', '/api/nope')
    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_found')
  })
})
