import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { parseBody } from '../lib/http'
import { requireAuth, requireRole } from '../middleware/auth'
import { vehicleUpdateSchema } from '../schemas'
import type { VehicleService } from '../services/vehicles'

export function vehicleController(service: VehicleService) {
  const r = new Hono<AppEnv>()

  r.use('*', requireAuth)

  r.get('/', async (c) => {
    const { dealershipId } = c.get('auth')
    return c.json({ vehicles: await service.list(c.env.DB, dealershipId) })
  })

  r.get('/:id', async (c) => {
    const { dealershipId } = c.get('auth')
    return c.json({ vehicle: await service.get(c.env.DB, dealershipId, c.req.param('id')) })
  })

  // The role is checked before the body, so a viewer gets 403 and never sees validation errors.
  r.put('/:id', requireRole('admin'), async (c) => {
    const input = await parseBody(c, vehicleUpdateSchema)
    const vehicle = await service.update(c.env.DB, c.get('auth'), c.req.param('id'), input)
    return c.json({ vehicle })
  })

  return r
}
