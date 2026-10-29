import { vi } from "vitest"
import type { User, Vehicle } from "../lib/api"

const sunrise = { id: "dlr_sunrise", name: "Sunrise Motors" }
const lakeside = { id: "dlr_lakeside", name: "Lakeside Auto" }

export const PASSWORD: string = import.meta.env.VITE_DEMO_PASSWORD

export const accounts: Record<string, User> = {
  "admin1@sunrise.test": {
    id: "u1",
    email: "admin1@sunrise.test",
    name: "Alex Admin",
    role: "admin",
    dealership: sunrise,
  },
  "admin2@sunrise.test": {
    id: "u2",
    email: "admin2@sunrise.test",
    name: "Blair Admin",
    role: "admin",
    dealership: sunrise,
  },
  "viewer@sunrise.test": {
    id: "u3",
    email: "viewer@sunrise.test",
    name: "Val Viewer",
    role: "viewer",
    dealership: sunrise,
  },
}

const v = (
  id: string,
  dealershipId: string,
  make: string,
  model: string,
  year: number,
  status: Vehicle["status"],
): Vehicle => ({
  id,
  dealershipId,
  make,
  model,
  year,
  status,
  version: 1,
  updatedAt: 1767225600,
  updatedBy: "seed",
})

export type FakeApi = ReturnType<typeof createFakeApi>

// In-memory fake of the API with the same status codes and error bodies.
// Tests flip the flags in `state` to trigger each error case.
export function createFakeApi() {
  const state = {
    session: null as User | null,
    expired: false, // next call gets 401 session_expired
    failList: false, // GET /api/vehicles returns a 502 HTML page
    networkDownForPut: false, // PUT fails like a dropped connection
    vehicles: [
      v("veh_sunrise_001", sunrise.id, "Toyota", "Corolla", 2021, "available"),
      v("veh_sunrise_002", sunrise.id, "Honda", "Civic", 2020, "available"),
      v("veh_lakeside_001", lakeside.id, "Subaru", "Outback", 2021, "available"),
    ] as Vehicle[],
    calls: [] as { method: string; path: string; body: any }[],
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  const err = (status: number, code: string, message: string, extra: object = {}) =>
    json(status, { error: { code, message, ...extra } })

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    state.calls.push({ method, path, body })

    if (method === "POST" && path === "/api/auth/login") {
      const user = accounts[body.email]
      if (!user || body.password !== PASSWORD) return err(401, "invalid_credentials", "Incorrect email or password.")
      state.session = user
      return json(200, { user })
    }
    if (method === "POST" && path === "/api/auth/logout") {
      state.session = null
      return json(200, { ok: true })
    }

    // Everything below needs a session.
    if (state.expired) {
      state.session = null
      state.expired = false
      return err(401, "session_expired", "Your session expired. Sign in again.")
    }
    if (!state.session) return err(401, "unauthenticated", "Sign in to continue.")
    const me = state.session

    if (path === "/api/auth/me") return json(200, { user: me })

    if (path === "/api/vehicles") {
      if (state.failList) {
        return new Response("<html>502 Bad gateway</html>", { status: 502 })
      }
      return json(200, { vehicles: state.vehicles.filter((x) => x.dealershipId === me.dealership.id) })
    }

    const match = path.match(/^\/api\/vehicles\/(.+)$/)
    if (match) {
      const id = decodeURIComponent(match[1])
      const vehicle = state.vehicles.find((x) => x.id === id && x.dealershipId === me.dealership.id)
      if (method === "GET") return vehicle ? json(200, { vehicle }) : err(404, "not_found", "Vehicle not found.")
      if (method === "PUT") {
        if (state.networkDownForPut) throw new TypeError("Failed to fetch")
        if (me.role !== "admin") return err(403, "forbidden", "Only administrators can make this change.")
        if (!vehicle) return err(404, "not_found", "Vehicle not found.")
        if (body.version !== vehicle.version) {
          return err(409, "conflict", "This vehicle was changed by someone else.", { current: vehicle })
        }
        const { version: _sent, ...edits } = body
        const updated: Vehicle = { ...vehicle, ...edits, version: vehicle.version + 1, updatedBy: me.email }
        state.vehicles = state.vehicles.map((x) => (x.id === id ? updated : x))
        return json(200, { vehicle: updated })
      }
    }
    return err(404, "not_found", "Unknown API route.")
  })

  return { state, fetchMock }
}
