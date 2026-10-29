import type { D1Migration } from '@cloudflare/vitest-plugin'

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      TEST_MIGRATIONS: D1Migration[]
      DEMO_PASSWORD: string
      SESSION_TTL_SECONDS?: string
      RELEASE?: string
    }
  }
}
