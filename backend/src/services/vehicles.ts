import type { AuthContext } from '../env'
import { ApiError } from '../lib/http'
import { nowSeconds } from '../lib/time'
import type { VehicleRepository } from '../repositories/vehicles'
import type { VehicleUpdateInput } from '../schemas'


export function createVehicleService(repository: VehicleRepository) {
  return {
    list(db: D1Database, dealershipId: string) {
      return repository.list(db, dealershipId)
    },

    async get(db: D1Database, dealershipId: string, id: string) {
      const vehicle = await repository.get(db, dealershipId, id)
      if (!vehicle) {
        throw new ApiError(404, 'not_found', 'Vehicle not found.')
      }
      return vehicle
    },

    async update(db: D1Database, auth: AuthContext, id: string, input: VehicleUpdateInput) {
      const result = await repository.update(db, auth.dealershipId, id, input, auth.email, nowSeconds())

      if (result.kind === 'not_found') {
        throw new ApiError(404, 'not_found', 'Vehicle not found.')
      }

      if (result.kind === 'conflict') {
        throw new ApiError(
          409,
          'conflict',
          'This vehicle was changed by someone else after you opened it. Refresh to load the latest version, then try again.',
          { current: result.current },
        )
      }

      return result.vehicle
    },
  }
}

export type VehicleService = ReturnType<typeof createVehicleService>
