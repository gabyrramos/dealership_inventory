import { afterEach, describe, expect, it, vi } from 'vitest'
import { vehicleUpdateSchema } from '../src/schemas'

const base = { make: 'Toyota', model: 'Corolla', status: 'available', version: 1 }

afterEach(() => vi.useRealTimers())

describe('vehicle schema year bound', () => {
  it('is computed from the current time at validation, not at module load', () => {
    // This used to be computed at import time, which on Workers meant a max year of 1971.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2040-06-01T00:00:00Z'))
    expect(vehicleUpdateSchema.safeParse({ ...base, year: 2041 }).success).toBe(true)
    expect(vehicleUpdateSchema.safeParse({ ...base, year: 2042 }).success).toBe(false)

    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
    expect(vehicleUpdateSchema.safeParse({ ...base, year: 2027 }).success).toBe(true)
    expect(vehicleUpdateSchema.safeParse({ ...base, year: 2028 }).success).toBe(false)
  })

  it('accepts ordinary model years', () => {
    for (const year of [1990, 2019, 2021, 2023]) {
      expect(vehicleUpdateSchema.safeParse({ ...base, year }).success).toBe(true)
    }
  })
})
