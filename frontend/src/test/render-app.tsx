import { QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { vi } from "vitest"
import { createQueryClient } from "../lib/query-client"
import AppLayout from "../routes/app-layout"
import Home from "../routes/home"
import Login from "../routes/login"
import VehicleEdit from "../routes/vehicle-edit"
import Vehicles from "../routes/vehicles"
import { type FakeApi, PASSWORD, createFakeApi } from "./fake-api"

// Same route nesting as src/routes.ts.
export function renderApp(path = "/", api: FakeApi = createFakeApi()) {
  vi.stubGlobal("fetch", api.fetchMock)
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="vehicles" element={<Vehicles />} />
            <Route path="vehicles/:id" element={<VehicleEdit />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { user, api }
}

export async function signIn(
  user: ReturnType<typeof userEvent.setup>,
  screen: typeof import("@testing-library/react").screen,
  email: string,
) {
  await user.type(await screen.findByLabelText("Email"), email)
  await user.type(screen.getByLabelText("Password"), PASSWORD)
  await user.click(screen.getByRole("button", { name: "Sign in" }))
}
