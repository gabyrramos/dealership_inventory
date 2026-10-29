import { useMutation, useQueryClient } from "@tanstack/react-query"
import { LogOut } from "lucide-react"
import { Link, Navigate, Outlet, useNavigate } from "react-router"
import { Badge } from "shared/components/ui/badge"
import { Button } from "shared/components/ui/button"
import { Skeleton } from "shared/components/ui/skeleton"
import { toast } from "sonner"
import { BrandMark } from "../components/brand"
import { ErrorState } from "../components/error-state"
import { AUTH_NOTICE_KEY, ME_KEY } from "../constants/query-keys"
import { api } from "../lib/api"
import { useMe } from "../lib/auth"

// Wraps every page that needs a login. Goes to /login when there is no session.
export default function AppLayout() {
  const me = useMe()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear() // remove this dealership's data from the cache
      queryClient.setQueryData(AUTH_NOTICE_KEY, null)
      queryClient.setQueryData(ME_KEY, null)
      toast.success("Signed out")
      navigate("/login", { replace: true })
    },
    onError: () => toast.error("Couldn't sign out. Check your connection and try again."),
  })

  if (me.isPending) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-4" aria-busy="true" data-testid="app-loading">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    )
  }
  if (!me.data) return <Navigate to="/login" replace />

  const user = me.data
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link to="/vehicles" className="flex items-center gap-2 font-semibold">
            <BrandMark size={32} />
            <span>{user.dealership.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user.name}</span>
            <Badge variant={user.role === "admin" ? "default" : "secondary"} data-testid="role-badge">
              {user.role === "admin" ? "Administrator" : "Viewer"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
