import { Navigate } from "react-router"
import { Spinner } from "shared/components/ui/spinner"
import { ErrorState } from "../components/error-state"
import { useMe } from "../lib/auth"

export default function Home() {
  const me = useMe()
  if (me.isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className="max-w-md mx-auto p-6">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    )
  }
  return <Navigate to={me.data ? "/vehicles" : "/login"} replace />
}
