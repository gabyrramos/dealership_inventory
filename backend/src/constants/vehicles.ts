export const VEHICLE_STATUSES = ['available', 'reserved', 'sold'] as const

// Limits used when validating a vehicle
export const MAX_TEXT_LENGTH = 50
export const MIN_YEAR = 1900

// Columns we read from the vehicles table
export const VEHICLE_COLUMNS = 'id, dealership_id, make, model, year, status, version, updated_at, updated_by'
