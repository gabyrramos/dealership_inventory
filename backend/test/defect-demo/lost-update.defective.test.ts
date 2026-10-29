import { beforeEach, describe, it } from 'vitest'
import { createApp } from '../../src/app'
import { defectiveVehicleRepository } from '../support/defective-repository'
import { resetDatabase } from '../support/helpers'
import { assertNoLostUpdate, runLostUpdateScenario } from '../support/lost-update-scenario'

// Same scenario as lost-update.regression.test.ts, but against the broken repository.
// This is supposed to fail. Run it with `npm run test:defect`.
describe('defective store (should fail)', () => {
  beforeEach(resetDatabase)

  it('two admins, same version: exactly one 200 and one 409', async () => {
    const outcome = await runLostUpdateScenario(createApp({ vehicles: defectiveVehicleRepository }), 2)
    assertNoLostUpdate(outcome)
  })
})
