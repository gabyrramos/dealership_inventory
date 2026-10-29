import { env } from 'cloudflare:workers'
import seedSql from '../../db/seed/seed.sql?raw'
import { createApp } from '../../src/app'

export type App = ReturnType<typeof createApp>

export const PASSWORD = env.DEMO_PASSWORD

export const USERS = {
  sunriseAdmin1: 'admin1@sunrise.test',
  sunriseAdmin2: 'admin2@sunrise.test',
  sunriseViewer: 'viewer@sunrise.test',
  lakesideAdmin1: 'admin1@lakeside.test',
  lakesideAdmin2: 'admin2@lakeside.test',
  lakesideViewer: 'viewer@lakeside.test',
} as const

export const VEHICLES = { sunrise: 'veh_sunrise_001', lakeside: 'veh_lakeside_001' } as const

// Same seed file the npm db:seed scripts use.
export async function resetDatabase() {
  await env.DB.exec(seedSql)
  await env.DB.exec('DELETE FROM login_attempts') // failed-login counters live outside the seed
}

export async function send(
  app: App,
  method: string,
  path: string,
  options: { cookie?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...options.headers }
  if (options.cookie) headers.cookie = options.cookie
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body))
  return app.request(path, { method, headers, body }, env)
}

// Returns the Cookie header to send on later requests.
export async function login(app: App, email: string, password = PASSWORD): Promise<string> {
  const res = await send(app, 'POST', '/api/auth/login', { body: { email, password } })
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`)
  return (res.headers.get('set-cookie') ?? '').split(';')[0]
}

export type VehicleJson = {
  id: string
  dealershipId: string
  make: string
  model: string
  year: number
  status: string
  version: number
  updatedAt: number
  updatedBy: string
}

export async function getVehicle(app: App, cookie: string, id: string): Promise<VehicleJson> {
  const res = await send(app, 'GET', `/api/vehicles/${id}`, { cookie })
  return ((await res.json()) as { vehicle: VehicleJson }).vehicle
}

// Compare before/after to check a rejected write didn't touch anything.
export async function vehiclesSnapshot(): Promise<string> {
  const { results } = await env.DB.prepare('SELECT * FROM vehicles ORDER BY id').all()
  return JSON.stringify(results)
}

export const validUpdate = (version: number, overrides: Record<string, unknown> = {}) => ({
  make: 'Toyota',
  model: 'Corolla Cross',
  year: 2023,
  status: 'reserved',
  version,
  ...overrides,
})
