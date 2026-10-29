import { type QueryClient, useQuery } from "@tanstack/react-query"
import { AUTH_NOTICE_KEY, ME_KEY } from "../constants/query-keys"
import { ApiError, type User, api } from "./api"

export type AuthNotice = "expired" | "invalid" | null

// Called when any request fails. On a 401 we clear the user (AppLayout then sends them to /login)
// and save a note so the login page can say why. A wrong password is a 401 too, but it's not a lost session.
export function handleUnauthorized(queryClient: QueryClient, error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401 || error.code === "invalid_credentials") {
    return
  }

  const notice: AuthNotice = error.code === "session_expired" ? "expired" : "invalid"
  queryClient.setQueryData(AUTH_NOTICE_KEY, notice)
  queryClient.setQueryData(ME_KEY, null)
}

// The logged-in user, or null if nobody is logged in.
export function useMe() {
  return useQuery<User | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return (await api.me()).user
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}
