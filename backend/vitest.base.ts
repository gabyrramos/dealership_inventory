import { existsSync } from 'node:fs'
import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Tests run inside workerd with a local D1, so they behave like production.
export function baseConfig(test: { include?: string[]; exclude?: string[] } = {}) {
  return defineConfig(async () => {
    const envFile = path.join(import.meta.dirname, '.env')
    if (existsSync(envFile)) process.loadEnvFile(envFile)
    if (!process.env.DEMO_PASSWORD) {
      throw new Error('DEMO_PASSWORD is not set. Copy backend/.env.example to backend/.env and fill it in.')
    }
    // Keep wrangler from loading the rest of .env into the test Worker (e.g. RELEASE=local).
    process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'

    const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'))
    return {
      plugins: [
        cloudflareTest({
          wrangler: { configPath: './wrangler.test.jsonc' },
          miniflare: { bindings: { TEST_MIGRATIONS: migrations, DEMO_PASSWORD: process.env.DEMO_PASSWORD } },
        }),
      ],
      test: {
        setupFiles: ['./test/support/apply-migrations.ts'],
        ...test,
      },
    }
  })
}
