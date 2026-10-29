import { z } from 'zod'
import { MAX_PASSWORD_LENGTH } from './constants/auth'
import { MAX_TEXT_LENGTH, MIN_YEAR, VEHICLE_STATUSES } from './constants/vehicles'

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number]

export const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Password is required.').max(MAX_PASSWORD_LENGTH),
})

// strictObject rejects extra fields, so a client can't send its own dealershipId or id.
// `version` is the version the client loaded. The repository uses it to detect edits made by someone else.
export const vehicleUpdateSchema = z.strictObject({
  make: z
    .string()
    .trim()
    .min(1, 'Make is required.')
    .max(MAX_TEXT_LENGTH, `Make must be ${MAX_TEXT_LENGTH} characters or fewer.`),
  model: z
    .string()
    .trim()
    .min(1, 'Model is required.')
    .max(MAX_TEXT_LENGTH, `Model must be ${MAX_TEXT_LENGTH} characters or fewer.`),
  year: z
    .number('Year must be a number.')
    .int('Year must be a whole number.')
    .min(MIN_YEAR, `Year must be ${MIN_YEAR} or later.`)
    .refine((year) => year <= new Date().getUTCFullYear() + 1, 'Year cannot be in the far future.'),
  status: z.enum(VEHICLE_STATUSES, { error: 'Status must be available, reserved or sold.' }),
  version: z.number('Version must be a number.').int().positive(),
})

export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>
