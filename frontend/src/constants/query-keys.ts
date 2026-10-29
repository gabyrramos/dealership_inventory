export const ME_KEY = ["me"] as const
export const AUTH_NOTICE_KEY = ["auth-notice"] as const
export const VEHICLES_KEY = ["vehicles"] as const
export const vehicleKey = (id: string) => ["vehicle", id] as const
