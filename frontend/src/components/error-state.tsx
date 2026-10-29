import { RefreshCw, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "shared/components/ui/alert"
import { Button } from "shared/components/ui/button"
import { ApiError } from "../lib/api"

// Shown when something fails to load. Has a retry button if onRetry is passed.
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  let title = "There was an error loading this page"
  let message = "Something unexpected happened. Please try again."

  if (error instanceof ApiError) {
    message = error.message
    if (error.code === "network") {
      title = "You appear to be offline"
    } else if (error.status === 403) {
      title = "You don't have access"
    } else if (error.status === 404) {
      title = "Not found"
    }
  }

  return (
    <Alert variant="destructive" data-testid="error-state">
      <TriangleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            <RefreshCw /> Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
