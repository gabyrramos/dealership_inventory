// wrangler dev won't start if the assets folder is missing. In dev Vite serves the
// frontend, so an empty folder is enough.
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

mkdirSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist/client'), { recursive: true })
