import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

if (!import.meta.env.VITE_DEMO_PASSWORD) {
  throw new Error("VITE_DEMO_PASSWORD is not set. Copy frontend/.env.example to frontend/.env and fill it in.")
}

afterEach(() => cleanup())
