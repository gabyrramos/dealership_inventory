import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useNavigate, useParams } from "react-router"
import { Alert, AlertDescription, AlertTitle } from "shared/components/ui/alert"
import { Button } from "shared/components/ui/button"
import { Input } from "shared/components/ui/input"
import { Label } from "shared/components/ui/label"
import { NativeSelect } from "shared/components/ui/native-select"
import { Skeleton } from "shared/components/ui/skeleton"
import { toast } from "sonner"
import { z } from "zod"
import { ErrorState } from "../components/error-state"
import { VEHICLES_KEY, vehicleKey } from "../constants/query-keys"
import {
  BANNER_TITLES,
  MAX_TEXT_LENGTH,
  MAX_YEAR,
  MIN_YEAR,
  STATUS_LABELS,
  VEHICLE_STATUSES,
} from "../constants/vehicles"
import { ApiError, type Vehicle, type VehicleStatus, api } from "../lib/api"
import { useMe } from "../lib/auth"

const schema = z.object({
  make: z
    .string()
    .trim()
    .min(1, "Enter the make.")
    .max(MAX_TEXT_LENGTH, `Make must be ${MAX_TEXT_LENGTH} characters or fewer.`),
  model: z
    .string()
    .trim()
    .min(1, "Enter the model.")
    .max(MAX_TEXT_LENGTH, `Model must be ${MAX_TEXT_LENGTH} characters or fewer.`),
  year: z
    .string()
    .regex(/^\d{4}$/, "Enter a 4-digit year.")
    .refine((y) => Number(y) >= MIN_YEAR && Number(y) <= MAX_YEAR, `Year must be between ${MIN_YEAR} and ${MAX_YEAR}.`),
  status: z.enum(VEHICLE_STATUSES),
})
type FormValues = z.infer<typeof schema>

type Banner = { kind: "forbidden" | "not_found" | "failed"; message: string }

export default function VehicleEdit() {
  const { id = "" } = useParams()
  const me = useMe()
  const isAdmin = me.data?.role === "admin"

  const query = useQuery({
    queryKey: vehicleKey(id),
    queryFn: async () => (await api.getVehicle(id)).vehicle,
    enabled: isAdmin,
    staleTime: 0,
    refetchOnMount: "always",
  })

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/vehicles">
        <ArrowLeft /> Back to inventory
      </Link>
    </Button>
  )

  // The server would reject the save with a 403 anyway. This just avoids showing a form that can't be used.
  if (me.data && !isAdmin) {
    return (
      <div className="space-y-4 max-w-xl">
        {back}
        <Alert variant="destructive" data-testid="forbidden-view">
          <TriangleAlert />
          <AlertTitle>Only administrators can edit vehicles</AlertTitle>
          <AlertDescription>You can view the inventory, but changes need an administrator.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-xl">
      {back}
      {query.isPending && (
        <div className="space-y-3" aria-busy="true" data-testid="vehicle-loading">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && (
        // The key includes the version, so after a refresh the form starts over with the new values.
        <EditForm
          key={`${query.data.id}:${query.data.version}`}
          vehicle={query.data}
          refreshing={query.isFetching}
          onRefresh={async () => {
            await query.refetch()
          }}
        />
      )}
    </div>
  )
}

function EditForm({
  vehicle,
  refreshing,
  onRefresh,
}: {
  vehicle: Vehicle
  refreshing: boolean
  onRefresh: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [conflict, setConflict] = useState<Vehicle | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      make: vehicle.make,
      model: vehicle.model,
      year: String(vehicle.year),
      status: vehicle.status,
    },
  })

  const save = useMutation({
    // We send the version we loaded. If someone saved since then, the server answers 409.
    mutationFn: (values: FormValues) =>
      api.updateVehicle(vehicle.id, { ...values, year: Number(values.year) }, vehicle.version),
    onSuccess: ({ vehicle: saved }) => {
      queryClient.setQueryData(vehicleKey(saved.id), saved)
      queryClient.invalidateQueries({ queryKey: VEHICLES_KEY })
      toast.success(`Saved ${saved.make} ${saved.model}`, { description: `Now at version ${saved.version}.` })
      navigate("/vehicles")
    },
    onError: (error) => {
      setBanner(null)
      if (!(error instanceof ApiError)) {
        setBanner({ kind: "failed", message: "Something unexpected happened. Your changes were not saved." })
        return
      }
      if (error.status === 409 && error.details.current) {
        setConflict(error.details.current)
      } else if (error.code === "validation_failed" && error.details.fieldErrors) {
        for (const [field, messages] of Object.entries(error.details.fieldErrors)) {
          if (field in form.getValues()) form.setError(field as keyof FormValues, { message: messages[0] })
        }
        setBanner({ kind: "failed", message: "Some fields need attention. Fix them and save again." })
      } else if (error.status === 403) {
        setBanner({ kind: "forbidden", message: "Your account isn't allowed to edit vehicles. Nothing was saved." })
      } else if (error.status === 404) {
        setBanner({
          kind: "not_found",
          message: "This vehicle no longer exists in your dealership's inventory. Nothing was saved.",
        })
      } else if (error.status !== 401) {
        // 401 is handled in one place (it redirects to the login page).
        setBanner({ kind: "failed", message: `${error.message} Your changes were not saved. You can try again.` })
      }
    },
  })

  const errors = form.formState.errors
  const updatedAt = new Date(vehicle.updatedAt * 1000).toLocaleString()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">
          Edit {vehicle.make} {vehicle.model}
        </h1>
        <p className="text-muted-foreground" data-testid="version-info">
          Version {vehicle.version} · last updated by {vehicle.updatedBy} on {updatedAt}
        </p>
      </div>

      {conflict && (
        <Alert variant="destructive" data-testid="conflict-alert">
          <TriangleAlert />
          <AlertTitle>Someone else updated this vehicle</AlertTitle>
          <AlertDescription>
            <p>
              {conflict.updatedBy} saved changes while you were editing (now version {conflict.version}). Your edit was
              not saved, refresh to load the latest values then make your changes again.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh latest values"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {banner && (
        <Alert variant="destructive" data-testid={`banner-${banner.kind}`}>
          <TriangleAlert />
          <AlertTitle>{BANNER_TITLES[banner.kind]}</AlertTitle>
          <AlertDescription>{banner.message}</AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={form.handleSubmit((values) => {
          setBanner(null)
          save.mutate(values)
        })}
        className="grid gap-4 rounded-lg border bg-white p-6"
        noValidate
      >
        <Field label="Make" htmlFor="make" error={errors.make?.message}>
          <Input id="make" aria-invalid={!!errors.make} {...form.register("make")} />
        </Field>
        <Field label="Model" htmlFor="model" error={errors.model?.message}>
          <Input id="model" aria-invalid={!!errors.model} {...form.register("model")} />
        </Field>
        <Field label="Year" htmlFor="year" error={errors.year?.message}>
          <Input id="year" inputMode="numeric" aria-invalid={!!errors.year} {...form.register("year")} />
        </Field>
        <Field label="Availability" htmlFor="status" error={errors.status?.message}>
          <NativeSelect id="status" aria-invalid={!!errors.status} {...form.register("status")}>
            {VEHICLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={save.isPending || !!conflict}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/vehicles">Cancel</Link>
          </Button>
          {conflict && <span className="text-sm text-muted-foreground">Refresh to continue.</span>}
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
