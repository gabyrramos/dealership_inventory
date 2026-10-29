import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { accounts, createFakeApi } from "./test/fake-api"
import { renderApp, signIn } from "./test/render-app"

afterEach(() => vi.unstubAllGlobals())

describe("minimum workflow: sign in, inventory, allowed update, sign out", () => {
  it("an administrator signs in, sees only their dealership, saves an edit, and sees it persisted", async () => {
    const { user, api } = renderApp("/")

    // Not signed in, so we land on sign-in.
    expect(await screen.findByRole("heading", { name: "Sign in to your account" })).toBeInTheDocument()
    await signIn(user, screen, "admin1@sunrise.test")

    // Only this dealership's vehicles.
    const table = await screen.findByRole("table")
    expect(within(table).getByText("Toyota")).toBeInTheDocument()
    expect(within(table).getByText("Honda")).toBeInTheDocument()
    expect(within(table).queryByText("Subaru")).not.toBeInTheDocument()
    expect(screen.getByText("Sunrise Motors")).toBeInTheDocument()
    expect(screen.getByTestId("role-badge")).toHaveTextContent("Administrator")

    // Open the edit form and change the vehicle.
    await user.click(screen.getByRole("link", { name: "Edit Toyota Corolla" }))
    expect(await screen.findByRole("heading", { name: "Edit Toyota Corolla" })).toBeInTheDocument()
    expect(screen.getByTestId("version-info")).toHaveTextContent("Version 1")

    const model = screen.getByLabelText("Model")
    await user.clear(model)
    await user.type(model, "Corolla Cross")
    await user.selectOptions(screen.getByLabelText("Availability"), "reserved")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    // Back on the list with the new values and the bumped version.
    const row = await screen.findByRole("row", { name: /Corolla Cross/ })
    expect(within(row).getByText("Reserved")).toBeInTheDocument()
    expect(within(row).getByText("v2")).toBeInTheDocument()

    // The save sent the version the form was loaded with.
    const put = api.state.calls.find((c) => c.method === "PUT")
    expect(put?.body).toEqual({ make: "Toyota", model: "Corolla Cross", year: 2021, status: "reserved", version: 1 })
  })

  it("signing out returns to sign-in and discards cached inventory", async () => {
    const { user } = renderApp("/")
    await signIn(user, screen, "admin1@sunrise.test")
    await screen.findByRole("table")

    await user.click(screen.getByRole("button", { name: /Sign out/ }))

    expect(await screen.findByRole("heading", { name: "Sign in to your account" })).toBeInTheDocument()
    expect(screen.queryByText("Toyota")).not.toBeInTheDocument()
  })
})

describe("sign-in failures", () => {
  it("shows a clear message for invalid credentials", async () => {
    const { user } = renderApp("/login")
    await user.type(await screen.findByLabelText("Email"), "admin1@sunrise.test")
    await user.type(screen.getByLabelText("Password"), "wrong-password")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    const alert = await screen.findByTestId("login-error")
    expect(alert).toHaveTextContent("Incorrect email or password")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("validates empty fields before calling the server", async () => {
    const { user, api } = renderApp("/login")
    await user.click(await screen.findByRole("button", { name: "Sign in" }))
    expect(await screen.findByText("Enter your email.")).toBeInTheDocument()
    expect(screen.getByText("Enter your password.")).toBeInTheDocument()
    expect(api.state.calls.some((c) => c.path === "/api/auth/login")).toBe(false)
  })

  it("explains when the server cannot be reached", async () => {
    const { user, api } = renderApp("/login")
    api.fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("Failed to fetch")
    })
    await user.type(await screen.findByLabelText("Email"), "admin1@sunrise.test")
    await user.type(screen.getByLabelText("Password"), "x")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByTestId("login-error")).toHaveTextContent("Can't reach the server")
  })
})

describe("access errors", () => {
  it("a viewer sees the inventory but no edit controls", async () => {
    const { user } = renderApp("/")
    await signIn(user, screen, "viewer@sunrise.test")

    await screen.findByRole("table")
    expect(screen.getByTestId("view-only-notice")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Edit/ })).not.toBeInTheDocument()
    expect(screen.getByTestId("role-badge")).toHaveTextContent("Viewer")
  })

  it("a viewer who opens an edit URL directly gets an 'administrators only' message and no form", async () => {
    const api = createFakeApi()
    api.state.session = accounts["viewer@sunrise.test"] // already signed in as a viewer
    renderApp("/vehicles/veh_sunrise_001", api)

    expect(await screen.findByTestId("forbidden-view")).toHaveTextContent("Only administrators can edit vehicles")
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument()
    expect(api.state.calls.some((c) => c.method === "PUT")).toBe(false)
  })

  it("shows the server's 403 if a non-admin write ever reaches the API", async () => {
    // Signed in as admin, but demoted on the server before saving.
    const { user, api } = renderApp("/")
    await signIn(user, screen, "admin1@sunrise.test")
    await user.click(await screen.findByRole("link", { name: "Edit Toyota Corolla" }))
    await screen.findByRole("heading", { name: "Edit Toyota Corolla" })

    api.state.session = { ...api.state.session!, role: "viewer" }
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(await screen.findByTestId("banner-forbidden")).toHaveTextContent("isn't allowed to edit vehicles")
  })
})

describe("session expiry", () => {
  it("redirects to sign-in with an 'expired' notice when the server rejects the session mid-use", async () => {
    const { user, api } = renderApp("/")
    await signIn(user, screen, "admin1@sunrise.test")
    await screen.findByRole("table")

    api.state.expired = true // session runs out while on the list
    await user.click(screen.getByRole("link", { name: "Edit Toyota Corolla" }))

    expect(await screen.findByRole("heading", { name: "Sign in to your account" })).toBeInTheDocument()
    expect(await screen.findByTestId("auth-notice")).toHaveTextContent("Your session expired")
  })
})

describe("API failures", () => {
  it("shows an error with a retry when the inventory cannot load, then recovers", async () => {
    const { user, api } = renderApp("/")
    api.state.failList = true
    await signIn(user, screen, "admin1@sunrise.test")

    // The client retries a failed GET once before giving up.
    const error = await screen.findByTestId("error-state", {}, { timeout: 5000 })
    expect(error).toHaveTextContent("unexpected response")

    api.state.failList = false // the outage ends
    await user.click(within(error).getByRole("button", { name: /Try again/ }))
    expect(await screen.findByRole("table")).toBeInTheDocument()
  })

  it("keeps the form editable and says nothing was saved when the connection drops during save", async () => {
    const { user, api } = renderApp("/")
    await signIn(user, screen, "admin1@sunrise.test")
    await user.click(await screen.findByRole("link", { name: "Edit Toyota Corolla" }))
    await screen.findByRole("heading", { name: "Edit Toyota Corolla" })

    api.state.networkDownForPut = true
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    const banner = await screen.findByTestId("banner-failed")
    expect(banner).toHaveTextContent("Can't reach the server")
    expect(banner).toHaveTextContent("not saved")
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled()
  })

  it("shows field errors from the server's validation response", async () => {
    const { user, api } = renderApp("/")
    await signIn(user, screen, "admin1@sunrise.test")
    await user.click(await screen.findByRole("link", { name: "Edit Toyota Corolla" }))
    await screen.findByRole("heading", { name: "Edit Toyota Corolla" })

    const original = api.fetchMock.getMockImplementation()!
    api.fetchMock.mockImplementation(async (input, init) =>
      init?.method === "PUT"
        ? new Response(
            JSON.stringify({
              error: {
                code: "validation_failed",
                message: "Some fields are invalid.",
                fieldErrors: { make: ["Make is required."] },
              },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          )
        : original(input, init),
    )
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(await screen.findByText("Make is required.")).toBeInTheDocument()
  })
})

describe("update conflict (two administrators, same starting version)", () => {
  it("explains the conflict, blocks saving until refreshed, then lets the retry succeed", async () => {
    const { user, api } = renderApp("/")
    await signIn(user, screen, "admin1@sunrise.test")
    await user.click(await screen.findByRole("link", { name: "Edit Toyota Corolla" }))
    await screen.findByRole("heading", { name: "Edit Toyota Corolla" })
    expect(screen.getByTestId("version-info")).toHaveTextContent("Version 1")

    // Meanwhile the other admin saves first (server is now at version 2).
    api.state.vehicles = api.state.vehicles.map((x) =>
      x.id === "veh_sunrise_001" ? { ...x, make: "Lexus", version: 2, updatedBy: "admin2@sunrise.test" } : x,
    )

    // Our admin submits from the stale version 1.
    const model = screen.getByLabelText("Model")
    await user.clear(model)
    await user.type(model, "My Stale Edit")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    const conflict = await screen.findByTestId("conflict-alert")
    expect(conflict).toHaveTextContent("Someone else updated this vehicle")
    expect(conflict).toHaveTextContent("admin2@sunrise.test")
    expect(conflict).toHaveTextContent("now version 2")
    expect(conflict).toHaveTextContent("Refresh")
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled() // have to refresh first

    // The stale edit never reached storage.
    expect(api.state.vehicles.find((x) => x.id === "veh_sunrise_001")?.model).toBe("Corolla")

    // Refresh loads the latest values and clears the conflict.
    await user.click(within(conflict).getByRole("button", { name: /Refresh latest values/ }))
    await waitFor(() => expect(screen.queryByTestId("conflict-alert")).not.toBeInTheDocument())
    expect(screen.getByLabelText("Make")).toHaveValue("Lexus")
    expect(screen.getByTestId("version-info")).toHaveTextContent("Version 2")
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled()

    // Retrying from the fresh version succeeds.
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    const row = await screen.findByRole("row", { name: /Lexus/ })
    expect(within(row).getByText("v3")).toBeInTheDocument()
  })
})
