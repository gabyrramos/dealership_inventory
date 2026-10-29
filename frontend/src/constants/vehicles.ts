import type { VehicleStatus } from "../lib/api"

export const VEHICLE_STATUSES = ["available", "reserved", "sold"] as const

export const STATUS_LABELS: Record<VehicleStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
}

// Status badge for each vehicle status
export const STATUS_BADGE_VARIANTS = { available: "default", reserved: "secondary", sold: "outline" } as const

// Edit form limits (the backend checks the same ones)
export const MAX_TEXT_LENGTH = 50
export const MIN_YEAR = 1900
export const MAX_YEAR = new Date().getFullYear() + 1

export const BANNER_TITLES = {
  forbidden: "Not allowed",
  not_found: "Vehicle not found",
  failed: "Couldn't save",
}
