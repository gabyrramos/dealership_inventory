import { expect } from 'vitest'
import { type App, USERS, VEHICLES, type VehicleJson, getVehicle, login, send } from './helpers'

export type Attempt = { label: string; make: string; status: number; body: any }

export type Outcome = {
  startVersion: number
  attempts: Attempt[]
  finalVehicle: VehicleJson
}

// Several admin sessions open the same vehicle, then all save different changes at once
// from the same starting version.
export async function runLostUpdateScenario(app: App, adminCount = 2): Promise<Outcome> {
  const emails = [USERS.sunriseAdmin1, USERS.sunriseAdmin2]
  const cookies: string[] = []
  for (let i = 0; i < adminCount; i++) cookies.push(await login(app, emails[i % emails.length]))

  // Everyone opens the edit form.
  const opened = await Promise.all(cookies.map((cookie) => getVehicle(app, cookie, VEHICLES.sunrise)))
  const startVersion = opened[0].version
  expect(new Set(opened.map((v) => v.version)).size).toBe(1)

  // Everyone hits save at the same time.
  const attempts = await Promise.all(
    cookies.map(async (cookie, i): Promise<Attempt> => {
      const make = `Editor${i + 1}`
      const res = await send(app, 'PUT', `/api/vehicles/${VEHICLES.sunrise}`, {
        cookie,
        body: { make, model: `Model${i + 1}`, year: 2020 + i, status: 'reserved', version: startVersion },
      })
      return { label: `admin session ${i + 1}`, make, status: res.status, body: await res.json() }
    }),
  )

  const finalVehicle = await getVehicle(app, cookies[0], VEHICLES.sunrise)
  return { startVersion, attempts, finalVehicle }
}

// What a correct implementation guarantees. Fails the test on a lost update.
export function assertNoLostUpdate(outcome: Outcome) {
  const { startVersion, attempts, finalVehicle } = outcome
  const winners = attempts.filter((a) => a.status === 200)
  const losers = attempts.filter((a) => a.status === 409)

  expect(winners, 'exactly one request must succeed').toHaveLength(1)
  expect(losers, 'every other request must get 409 Conflict').toHaveLength(attempts.length - 1)

  const winner = winners[0]
  expect(finalVehicle.make, 'the stored record must hold the winning update').toBe(winner.make)
  expect(finalVehicle.version, 'version must advance by exactly one').toBe(startVersion + 1)
  expect(winner.body.vehicle.version).toBe(startVersion + 1)

  for (const loser of losers) {
    expect(loser.body.error.code).toBe('conflict')
    expect(loser.body.error.current.make, '409 returns the winner so the UI can refresh').toBe(winner.make)
    expect(finalVehicle.make, `rejected edit by ${loser.label} must not have touched the record`).not.toBe(loser.make)
  }
}
