import { useQuery } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { Link } from "react-router"
import { Alert, AlertDescription, AlertTitle } from "shared/components/ui/alert"
import { Button } from "shared/components/ui/button"
import { Skeleton } from "shared/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "shared/components/ui/table"
import { ErrorState } from "../components/error-state"
import { StatusBadge } from "../components/status-badge"
import { VEHICLES_KEY } from "../constants/query-keys"
import { api } from "../lib/api"
import { useMe } from "../lib/auth"

export default function Vehicles() {
  const me = useMe()
  const isAdmin = me.data?.role === "admin"
  const vehicles = useQuery({
    queryKey: VEHICLES_KEY,
    queryFn: async () => (await api.listVehicles()).vehicles,
  })

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="text-muted-foreground">
          {me.data?.dealership.name}
          {vehicles.data ? ` · ${vehicles.data.length} vehicles` : ""}
        </p>
      </div>

      {me.data && !isAdmin && (
        <Alert data-testid="view-only-notice">
          <AlertTitle>View-only access</AlertTitle>
          <AlertDescription>Ask an administrator at your dealership if a vehicle needs to change.</AlertDescription>
        </Alert>
      )}

      {vehicles.isPending && (
        <div className="space-y-2" aria-busy="true" data-testid="vehicles-loading">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      )}

      {vehicles.isError && <ErrorState error={vehicles.error} onRetry={() => vehicles.refetch()} />}

      {vehicles.data &&
        (vehicles.data.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">No vehicles in this inventory yet.</p>
        ) : (
          <div className="rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Make</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.data.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.make}</TableCell>
                    <TableCell>{v.model}</TableCell>
                    <TableCell>{v.year}</TableCell>
                    <TableCell>
                      <StatusBadge status={v.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">v{v.version}</TableCell>
                    <TableCell className="text-right">
                      {isAdmin && (
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/vehicles/${v.id}`} aria-label={`Edit ${v.make} ${v.model}`}>
                            <Pencil /> Edit
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
    </section>
  )
}
