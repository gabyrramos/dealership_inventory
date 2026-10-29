import { Hono } from 'hono'
import type { AppEnv } from '../env'

export function healthController() {
  const r = new Hono<AppEnv>()

  r.get('/health', async (c) => {
    let databaseOk = true
    try {
      await c.env.DB.prepare('SELECT 1').first()
    } catch {
      databaseOk = false
    }

    return c.json(
      {
        status: databaseOk ? 'ok' : 'degraded',
        database: databaseOk ? 'ok' : 'unavailable',
        release: c.env.RELEASE ?? 'dev',
        time: new Date().toISOString(),
      },
      databaseOk ? 200 : 503,
    )
  })

  return r
}
