import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { defectiveVehicleRepository } from './support/defective-repository'
import { USERS, VEHICLES, getVehicle, login, resetDatabase, send, validUpdate } from './support/helpers'
import { assertNoLostUpdate, runLostUpdateScenario } from './support/lost-update-scenario'

describe('concurrent edits from the same version', () => {
  beforeEach(resetDatabase)

  it('two admins, same version: exactly one 200, one 409, and the stored record is the winner’s', async () => {
    const outcome = await runLostUpdateScenario(createApp(), 2)
    expect(outcome.attempts.map((a) => a.status).sort()).toEqual([200, 409])
    assertNoLostUpdate(outcome)
  })

  it('six sessions at once: one winner, five conflicts', async () => {
    const outcome = await runLostUpdateScenario(createApp(), 6)
    expect(outcome.attempts.filter((a) => a.status === 200)).toHaveLength(1)
    expect(outcome.attempts.filter((a) => a.status === 409)).toHaveLength(5)
    assertNoLostUpdate(outcome)
  })

  it('a sequential stale edit is also refused and does not modify any field', async () => {
    const app = createApp()
    const a = await login(app, USERS.sunriseAdmin1)
    const b = await login(app, USERS.sunriseAdmin2)

    expect((await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, { cookie: a, body: validUpdate(1) })).status).toBe(200)
    const afterWinner = await getVehicle(app, a, VEHICLES.sunrise)

    const stale = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, {
      cookie: b,
      body: validUpdate(1, { make: 'Stale', model: 'Overwrite', year: 2001, status: 'sold' }),
    })
    expect(stale.status).toBe(409)
    expect(await getVehicle(app, b, VEHICLES.sunrise)).toEqual(afterWinner) // every field identical

    // After refreshing, the second admin can save.
    const retry = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, {
      cookie: b,
      body: validUpdate(afterWinner.version, { make: 'Retry' }),
    })
    expect(retry.status).toBe(200)
    expect((await getVehicle(app, b, VEHICLES.sunrise)).version).toBe(3)
  })

  it('a version from the future is also a conflict, never a write', async () => {
    const app = createApp()
    const cookie = await login(app, USERS.sunriseAdmin1)
    const res = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, { cookie, body: validUpdate(50) })
    expect(res.status).toBe(409)
    expect((await getVehicle(app, cookie, VEHICLES.sunrise)).version).toBe(1)
  })
})

describe('the test above can actually catch the bug', () => {
  beforeEach(resetDatabase)

  // Fails if someone weakens assertNoLostUpdate or accidentally fixes the broken repository.
  it('the same scenario run against the defective read-then-write repository VIOLATES the invariants', async () => {
    const outcome = await runLostUpdateScenario(createApp({ vehicles: defectiveVehicleRepository }), 2)

    expect(outcome.attempts.map((a) => a.status)).toEqual([200, 200]) // both "won"
    expect(() => assertNoLostUpdate(outcome)).toThrow()
  })
})
