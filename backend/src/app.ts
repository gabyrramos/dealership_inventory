import { Hono } from 'hono'
import type { AppEnv } from './env'
import { errorResponse } from './lib/errors'
import { ApiError } from './lib/http'
import { jsonOnly } from './middleware/json-only'
import { authController } from './controllers/auth'
import { healthController } from './controllers/health'
import { vehicleController } from './controllers/vehicles'
import { type VehicleRepository, d1VehicleRepository } from './repositories/vehicles'
import { createVehicleService } from './services/vehicles'

export type AppDeps = {
  vehicles?: VehicleRepository
}

export function createApp(deps: AppDeps = {}) {
  const app = new Hono<AppEnv>()
  const api = new Hono<AppEnv>()

  api.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })
  api.use('*', jsonOnly)
  api.route('/', healthController())
  api.route('/auth', authController())
  api.route('/vehicles', vehicleController(createVehicleService(deps.vehicles ?? d1VehicleRepository)))

  app.route('/api', api)

  app.notFound((c) =>
    c.req.path.startsWith('/api/') ? errorResponse(c, 404, 'not_found', 'Unknown API route.') : c.text('Not found', 404),
  )

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      if (err.code === 'rate_limited') c.header('Retry-After', String(err.extra.retryAfterSeconds))
      return errorResponse(c, err.status, err.code, err.message, err.extra)
    }
    console.error('Unhandled error', err) 
    return errorResponse(c, 500, 'internal_error', 'Something went wrong on our side. Please try again.')
  })

  return app
}
