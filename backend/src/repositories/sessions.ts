import type { AuthContext, Role } from '../env'

type SessionRow = {
  expires_at: number
  user_id: string
  email: string
  name: string
  role: Role
  dealership_id: string
  dealership_name: string
}

export type FoundSession = { expiresAt: number; auth: AuthContext }

export async function createSession(
  db: D1Database,
  tokenHash: string,
  userId: string,
  nowSeconds: number,
  ttlSeconds: number,
): Promise<void> {
  // Delete expired sessions here so we don't need a scheduled cleanup job.
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?1').bind(nowSeconds),
    db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(tokenHash, userId, nowSeconds, nowSeconds + ttlSeconds),
  ])
}

// Loads the user and dealership on every request, so a role change takes effect right away.
export async function findSession(db: D1Database, tokenHash: string): Promise<FoundSession | null> {
  const row = await db
    .prepare(
      `SELECT s.expires_at, u.id AS user_id, u.email, u.name, u.role,
              u.dealership_id, d.name AS dealership_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN dealerships d ON d.id = u.dealership_id
        WHERE s.token_hash = ?1`,
    )
    .bind(tokenHash)
    .first<SessionRow>()
  if (!row) return null
  return {
    expiresAt: row.expires_at,
    auth: {
      userId: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      dealershipId: row.dealership_id,
      dealershipName: row.dealership_name,
    },
  }
}

export async function deleteSession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run()
}
