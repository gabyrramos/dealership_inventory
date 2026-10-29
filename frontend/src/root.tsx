import { QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useNavigate } from "react-router"
import { Button } from "shared/components/ui/button"
import { Toaster } from "shared/components/ui/sonner"
import { Spinner } from "shared/components/ui/spinner"
import { createQueryClient } from "./lib/query-client"
import "shared/styles/theme.css"

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <title>Dealership Inventory</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <noscript>You need to enable JavaScript to use this app.</noscript>
      </body>
    </html>
  )
}

export function HydrateFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen w-full">
      <Spinner />
    </div>
  )
}

export default function App() {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  )
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const navigate = useNavigate()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <main className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-3xl font-bold">{notFound ? "Page not found" : "Something went wrong"}</h1>
        <p className="text-muted-foreground">
          {notFound ? "That page doesn't exist." : "An unexpected error occurred. Reload the page to try again."}
        </p>
        <Button onClick={() => navigate("/")}>Back to inventory</Button>
      </div>
    </main>
  )
}
