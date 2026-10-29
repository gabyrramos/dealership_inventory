// Demo accounts for reviewers. The login page only shows them if VITE_DEMO_PASSWORD is set.
export const DEMO_PASSWORD: string | undefined = import.meta.env.VITE_DEMO_PASSWORD

export const DEMO_ACCOUNTS = [
  ["admin1@sunrise.test", "Sunrise · admin"],
  ["admin2@sunrise.test", "Sunrise · admin (second)"],
  ["viewer@sunrise.test", "Sunrise · viewer"],
  ["admin1@lakeside.test", "Lakeside · admin"],
  ["admin2@lakeside.test", "Lakeside · admin (second)"],
  ["viewer@lakeside.test", "Lakeside · viewer"],
] as const
