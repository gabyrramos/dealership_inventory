import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import {
  USERS,
  VEHICLES,
  type VehicleJson,
  getVehicle,
  login,
  resetDatabase,
  send,
  validUpdate,
  vehiclesSnapshot,
} from './support/helpers'

const app = createApp()

// These call the API directly, skipping anything the UI would hide.
describe('role enforcement: viewers are read-only', () => {
  beforeEach(resetDatabase)

  it('lets a viewer read their own dealership inventory', async () => {
    const cookie = await login(app, USERS.sunriseViewer)
    const res = await send(app, 'GET', '/api/vehicles', { cookie })
    expect(res.status).toBe(200)
    const { vehicles } = (await res.json()) as { vehicles: VehicleJson[] }
    expect(vehicles).toHaveLength(4)
  })

  it('rejects a viewer edit with 403 and leaves stored data unchanged', async () => {
    const cookie = await login(app, USERS.sunriseViewer)
    const before = await vehiclesSnapshot()

    const res = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, { cookie, body: validUpdate(1) })

    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('forbidden')
    expect(await vehiclesSnapshot()).toBe(before)
  })

  it('checks the role before validating, so a viewer learns nothing from malformed bodies', async () => {
    const cookie = await login(app, USERS.sunriseViewer)
    const res = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, { cookie, body: { junk: true } })
    expect(res.status).toBe(403)
  })
})

describe('dealership isolation', () => {
  beforeEach(resetDatabase)

  it('lists only the signed-in dealership’s vehicles', async () => {
    const sunrise = await login(app, USERS.sunriseAdmin1)
    const lakeside = await login(app, USERS.lakesideAdmin1)
    const a = ((await (await send(app, 'GET', '/api/vehicles', { cookie: sunrise })).json()) as { vehicles: VehicleJson[] })
      .vehicles
    const b = ((await (await send(app, 'GET', '/api/vehicles', { cookie: lakeside })).json()) as { vehicles: VehicleJson[] })
      .vehicles
    expect(a.every((v) => v.dealershipId === 'dlr_sunrise')).toBe(true)
    expect(b.every((v) => v.dealershipId === 'dlr_lakeside')).toBe(true)
    expect(a.map((v) => v.id)).not.toContain(VEHICLES.lakeside)
  })

  it.each([
    ['admin', USERS.sunriseAdmin1],
    ['viewer', USERS.sunriseViewer],
  ])('hides another dealership’s vehicle from a %s (404, not 403, so existence is not leaked)', async (_r, email) => {
    const cookie = await login(app, email)
    const res = await send(app, 'GET', `/api/vehicles/${VEHICLES.lakeside}`, { cookie })
    expect(res.status).toBe(404)
  })

  it('rejects an admin updating another dealership’s vehicle and leaves it unchanged', async () => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    const before = await vehiclesSnapshot()

    const res = await send(app, 'PUT', `/api/vehicles/${VEHICLES.lakeside}`, {
      cookie,
      body: validUpdate(1, { make: 'Hijacked' }),
    })

    expect(res.status).toBe(404)
    expect(await vehiclesSnapshot()).toBe(before)
  })

  it('ignores any dealership the client claims; only the session decides', async () => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    const before = await vehiclesSnapshot()
    for (const extra of [{ dealershipId: 'dlr_lakeside' }, { dealership_id: 'dlr_lakeside' }, { id: 'veh_x' }]) {
      const res = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, {
        cookie,
        body: validUpdate(1, extra),
      })
      expect(res.status).toBe(400) // strict schema: unknown fields are refused
    }
    const viaQuery = await send(app, 'GET', `/api/vehicles?dealershipId=dlr_lakeside`, { cookie })
    const { vehicles } = (await viaQuery.json()) as { vehicles: VehicleJson[] }
    expect(vehicles.every((v) => v.dealershipId === 'dlr_sunrise')).toBe(true)
    expect(await vehiclesSnapshot()).toBe(before)
  })
})

describe('input validation never writes', () => {
  beforeEach(resetDatabase)

  const invalid: [string, Record<string, unknown>][] = [
    ['empty make', { make: '   ' }],
    ['make too long', { make: 'x'.repeat(51) }],
    ['year as string', { year: '2020' }],
    ['year too old', { year: 1800 }],
    ['year in the far future', { year: 3000 }],
    ['fractional year', { year: 2020.5 }],
    ['unknown status', { status: 'stolen' }],
    ['version as string', { version: '1' }],
    ['version zero', { version: 0 }],
  ]

  it.each(invalid)('rejects %s with 400 and leaves data unchanged', async (_name, override) => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    const before = await vehiclesSnapshot()
    const res = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, { cookie, body: validUpdate(1, override) })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; fieldErrors: Record<string, string[]> } }
    expect(body.error.code).toBe('validation_failed')
    expect(await vehiclesSnapshot()).toBe(before)
  })

  it('rejects a malformed JSON body with 400', async () => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    const res = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, { cookie, rawBody: '{not json' })
    expect(res.status).toBe(400)
  })
})

describe('permitted administrator updates', () => {
  beforeEach(resetDatabase)

  it('updates, bumps the version by exactly one, and persists across requests', async () => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    const before = await getVehicle(app, cookie, VEHICLES.sunrise)
    expect(before.version).toBe(1)

    const res = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, { cookie, body: validUpdate(1) })
    expect(res.status).toBe(200)
    const { vehicle } = (await res.json()) as { vehicle: VehicleJson }
    expect(vehicle).toMatchObject({ make: 'Toyota', model: 'Corolla Cross', year: 2023, status: 'reserved', version: 2 })
    expect(vehicle.updatedBy).toBe(USERS.sunriseAdmin1)

    // The other admin sees the change too.
    const otherAdmin = await login(app, USERS.sunriseAdmin2)
    expect(await getVehicle(app, otherAdmin, VEHICLES.sunrise)).toEqual(vehicle)
  })

  it('trims whitespace and leaves ownership untouched', async () => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    const res = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, {
      cookie,
      body: validUpdate(1, { make: '  Honda ', model: ' Accord ' }),
    })
    const { vehicle } = (await res.json()) as { vehicle: VehicleJson }
    expect(vehicle).toMatchObject({ make: 'Honda', model: 'Accord', dealershipId: 'dlr_sunrise' })
  })

  it('returns 404 for a vehicle that does not exist', async () => {
    const cookie = await login(app, USERS.sunriseAdmin1)
    const res = await send(app, 'PUT', '/api/vehicles/veh_missing', { cookie, body: validUpdate(1) })
    expect(res.status).toBe(404)
  })
})
