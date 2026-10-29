import { VEHICLE_COLUMNS } from '../constants/vehicles'
import type { VehicleStatus, VehicleUpdateInput } from '../schemas'

export type Vehicle = {
  id: string
  dealershipId: string
  make: string
  model: string
  year: number
  status: VehicleStatus
  version: number
  updatedAt: number
  updatedBy: string
}

export type UpdateResult =
  | { kind: 'updated'; vehicle: Vehicle }
  | { kind: 'conflict'; current: Vehicle }
  | { kind: 'not_found' }

export interface VehicleRepository {
  list(db: D1Database, dealershipId: string): Promise<Vehicle[]>
  get(db: D1Database, dealershipId: string, id: string): Promise<Vehicle | null>
  update(
    db: D1Database,
    dealershipId: string,
    id: string,
    input: VehicleUpdateInput,
    actor: string,
    nowSeconds: number,
  ): Promise<UpdateResult>
}

type VehicleRow = {
  id: string
  dealership_id: string
  make: string
  model: string
  year: number
  status: VehicleStatus
  version: number
  updated_at: number
  updated_by: string
}

export function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    dealershipId: row.dealership_id,
    make: row.make,
    model: row.model,
    year: row.year,
    status: row.status,
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

async function get(db: D1Database, dealershipId: string, id: string): Promise<Vehicle | null> {
  // Filtering by dealership means a vehicle from another dealership looks like it doesn't exist.
  const row = await db
    .prepare(`SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE id = ?1 AND dealership_id = ?2`)
    .bind(id, dealershipId)
    .first<VehicleRow>()
  return row ? toVehicle(row) : null
}

export const d1VehicleRepository: VehicleRepository = {
  async list(db, dealershipId) {
    const { results } = await db
      .prepare(`SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE dealership_id = ?1 ORDER BY make, model, year`)
      .bind(dealershipId)
      .all<VehicleRow>()
    return results.map(toVehicle)
  },

  get,

  // The version check and the update happen in one query, so they can't be split up by another request.
  // If two admins save from the same version, only the first one matches. The second updates nothing.
  // When nothing was updated we look the vehicle up to decide between 409 (conflict) and 404.
  async update(db, dealershipId, id, input, actor, nowSeconds) {
    const row = await db
      .prepare(
        `UPDATE vehicles
            SET make = ?1, model = ?2, year = ?3, status = ?4,
                version = version + 1, updated_at = ?5, updated_by = ?6
          WHERE id = ?7 AND dealership_id = ?8 AND version = ?9
      RETURNING ${VEHICLE_COLUMNS}`,
      )
      .bind(input.make, input.model, input.year, input.status, nowSeconds, actor, id, dealershipId, input.version)
      .first<VehicleRow>()

    if (row) return { kind: 'updated', vehicle: toVehicle(row) }

    const current = await get(db, dealershipId, id)
    return current ? { kind: 'conflict', current } : { kind: 'not_found' }
  },
}
