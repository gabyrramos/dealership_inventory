import type { Role } from '../env'

export type UserRecord = {
  id: string
  email: string
  name: string
  role: Role
  passwordHash: string
  dealershipId: string
  dealershipName: string
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.password_hash,
              u.dealership_id, d.name AS dealership_name
         FROM users u JOIN dealerships d ON d.id = u.dealership_id
        WHERE u.email = ?1`,
    )
    .bind(email)
    .first<{
      id: string
      email: string
      name: string
      role: Role
      password_hash: string
      dealership_id: string
      dealership_name: string
    }>()
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    passwordHash: row.password_hash,
    dealershipId: row.dealership_id,
    dealershipName: row.dealership_name,
  }
}
