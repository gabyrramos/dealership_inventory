export type Role = 'admin' | 'viewer'

export type Bindings = {
  DB: D1Database
  // Defaults to 8 hours if unset.
  SESSION_TTL_SECONDS?: string
  // Git SHA, set by the deploy workflow.
  RELEASE?: string
}

export type AuthContext = {
  userId: string
  email: string
  name: string
  role: Role
  dealershipId: string
  dealershipName: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: { auth: AuthContext }
}
