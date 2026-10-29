import { VEHICLE_COLUMNS } from '../../src/constants/vehicles'
import { type VehicleRepository, d1VehicleRepository, toVehicle } from '../../src/repositories/vehicles'

// Broken on purpose, test-only (nothing in src/ imports it).
// Reads the version, checks it in JS, then writes without a version check. Two admins
// on the same version both pass, and the second save silently overwrites the first.
export const defectiveVehicleRepository: VehicleRepository = {
  ...d1VehicleRepository,

  async update(db, dealershipId, id, input, actor, nowSeconds) {
    const current = await db
      .prepare(`SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE id = ?1 AND dealership_id = ?2`)
      .bind(id, dealershipId)
      .first<Parameters<typeof toVehicle>[0]>()
    if (!current) return { kind: 'not_found' }
    if (current.version !== input.version) return { kind: 'conflict', current: toVehicle(current) }

    // Widen the gap between check and write so the race happens every run, not just sometimes.
    await new Promise((resolve) => setTimeout(resolve, 15))

    // The bug: no `AND version = ?` here.
    await db
      .prepare(
        `UPDATE vehicles SET make = ?1, model = ?2, year = ?3, status = ?4,
                version = ?5, updated_at = ?6, updated_by = ?7
          WHERE id = ?8 AND dealership_id = ?9`,
      )
      .bind(input.make, input.model, input.year, input.status, input.version + 1, nowSeconds, actor, id, dealershipId)
      .run()

    const row = await db
      .prepare(`SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE id = ?1`)
      .bind(id)
      .first<Parameters<typeof toVehicle>[0]>()
    return { kind: 'updated', vehicle: toVehicle(row!) }
  },
}
