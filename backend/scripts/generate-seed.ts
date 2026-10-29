// Writes db/seed/seed.sql: 2 dealerships, 6 users, 8 vehicles.
// Reads DEMO_PASSWORD (and optionally PBKDF2_ITERATIONS) from backend/.env.
//
// Salts come from the email, so the output is the same every run and CI can check it's up to date.
// The file wipes all tables first, so running it again resets the demo.
// Keep each statement on one line: D1's exec() splits on newlines.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_ITERATIONS } from '../src/constants/password'
import { hashPassword } from '../src/lib/password'

const here = dirname(fileURLToPath(import.meta.url))
const outFile = resolve(here, '../db/seed/seed.sql')

const SEED_PASSWORD = process.env.DEMO_PASSWORD
if (!SEED_PASSWORD) {
  console.error('DEMO_PASSWORD is not set. Copy backend/.env.example to backend/.env and fill it in.')
  process.exit(1)
}
const iterations = Number(process.env.PBKDF2_ITERATIONS ?? DEFAULT_ITERATIONS)
const SEED_TIME = 1767225600 // 2026-01-01, fixed so the output doesn't change

const dealerships = [
  { id: 'dlr_sunrise', slug: 'sunrise', name: 'Sunrise Motors' },
  { id: 'dlr_lakeside', slug: 'lakeside', name: 'Lakeside Auto' },
]

type Role = 'admin' | 'viewer'
const userTemplates: { local: string; name: string; role: Role }[] = [
  { local: 'admin1', name: 'Alex Admin', role: 'admin' },
  { local: 'admin2', name: 'Blair Admin', role: 'admin' },
  { local: 'viewer', name: 'Val Viewer', role: 'viewer' },
]

const vehicles: Record<string, [string, string, number, string][]> = {
  sunrise: [
    ['Toyota', 'Corolla', 2021, 'available'],
    ['Honda', 'Civic', 2020, 'available'],
    ['Ford', 'F-150', 2019, 'reserved'],
    ['Mazda', 'CX-5', 2022, 'available'],
  ],
  lakeside: [
    ['Subaru', 'Outback', 2021, 'available'],
    ['Hyundai', 'Elantra', 2022, 'sold'],
    ['Chevrolet', 'Silverado', 2018, 'available'],
    ['Kia', 'Sportage', 2023, 'reserved'],
  ],
}

const sql = (value: string | number) => (typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`)

async function saltFor(email: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`seed-salt:${email}`))
  return new Uint8Array(digest).slice(0, 16)
}

const lines: string[] = [
  'DELETE FROM sessions;',
  'DELETE FROM vehicles;',
  'DELETE FROM users;',
  'DELETE FROM dealerships;',
]

for (const d of dealerships) {
  lines.push(`INSERT INTO dealerships (id, name) VALUES (${sql(d.id)}, ${sql(d.name)});`)
}

for (const d of dealerships) {
  for (const u of userTemplates) {
    const email = `${u.local}@${d.slug}.test`
    const hash = await hashPassword(SEED_PASSWORD, { iterations, salt: await saltFor(email) })
    const id = `usr_${d.slug}_${u.local}`
    lines.push(
      `INSERT INTO users (id, dealership_id, email, name, role, password_hash) VALUES (${sql(id)}, ${sql(d.id)}, ${sql(email)}, ${sql(u.name)}, ${sql(u.role)}, ${sql(hash)});`,
    )
  }
}

for (const d of dealerships) {
  vehicles[d.slug].forEach(([make, model, year, status], index) => {
    const id = `veh_${d.slug}_${String(index + 1).padStart(3, '0')}`
    lines.push(
      `INSERT INTO vehicles (id, dealership_id, make, model, year, status, version, updated_at, updated_by) VALUES (${sql(id)}, ${sql(d.id)}, ${sql(make)}, ${sql(model)}, ${sql(year)}, ${sql(status)}, 1, ${SEED_TIME}, 'seed');`,
    )
  })
}

writeFileSync(outFile, `${lines.join('\n')}\n`)
console.log(`Wrote ${outFile} (${lines.length} statements, PBKDF2 iterations: ${iterations})`)
