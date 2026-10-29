import { API_PATHS } from "../constants/api"

// These types match what the backend sends.
export type Role = "admin" | "viewer"
export type VehicleStatus = "available" | "reserved" | "sold"

export type User = {
  id: string
  email: string
  name: string
  role: Role
  dealership: { id: string; name: string }
}

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

export type VehicleInput = { make: string; model: string; year: number; status: VehicleStatus }

export type ErrorCode =
  | "unauthenticated"
  | "session_expired"
  | "invalid_credentials"
  | "rate_limited"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "unsupported_media_type"
  | "validation_failed"
  | "conflict"
  | "internal_error"
  | "network" // never reached the server
  | "unknown"

// Every failed request becomes one of these, so screens can check `code` instead of reading the message.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: { fieldErrors?: Record<string, string[]>; current?: Vehicle } = {},
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      // The API only accepts JSON writes (part of its CSRF protection).
      headers: method === "GET" ? undefined : { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    })
  } catch {
    throw new ApiError(0, "network", "Can't reach the server. Check your connection and try again.")
  }

  let payload: any = null
  try {
    payload = await response.json()
  } catch {
    // The response wasn't JSON (for example a Cloudflare error page). Handled below.
  }

  if (response.ok) return payload as T

  const error = payload?.error
  if (error?.code) {
    throw new ApiError(response.status, error.code, error.message, {
      fieldErrors: error.fieldErrors,
      current: error.current,
    })
  }
  throw new ApiError(
    response.status,
    response.status >= 500 ? "internal_error" : "unknown",
    "The server returned an unexpected response. Please try again.",
  )
}

export const api = {
  login: (email: string, password: string) => request<{ user: User }>("POST", API_PATHS.login, { email, password }),
  logout: () => request<{ ok: true }>("POST", API_PATHS.logout),
  me: () => request<{ user: User }>("GET", API_PATHS.me),
  listVehicles: () => request<{ vehicles: Vehicle[] }>("GET", API_PATHS.vehicles),
  getVehicle: (id: string) => request<{ vehicle: Vehicle }>("GET", `${API_PATHS.vehicles}/${encodeURIComponent(id)}`),
  updateVehicle: (id: string, input: VehicleInput, version: number) =>
    request<{ vehicle: Vehicle }>("PUT", `${API_PATHS.vehicles}/${encodeURIComponent(id)}`, { ...input, version }),
}
