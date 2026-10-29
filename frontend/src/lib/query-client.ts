import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"
import { ApiError } from "./api"
import { handleUnauthorized } from "./auth"

export function createQueryClient() {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => handleUnauthorized(client, error) }),
    mutationCache: new MutationCache({ onError: (error) => handleUnauthorized(client, error) }),
    defaultOptions: {
      queries: {
        // Retry network and server errors once. Retrying a 4xx would give the same answer.
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false
          }
          return failureCount < 1
        },
        refetchOnWindowFocus: false,
      },
    },
  })
  return client
}
