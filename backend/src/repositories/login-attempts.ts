type AttemptRow = { count: number; window_start: number }

// Seconds until `key` may try again, or 0 if it isn't blocked.
export async function blockedFor(
  db: D1Database,
  key: string,
  maxFailures: number,
  nowSeconds: number,
  windowSeconds: number,
): Promise<number> {
  const row = await db
    .prepare('SELECT count, window_start FROM login_attempts WHERE key = ?1')
    .bind(key)
    .first<AttemptRow>()
  if (!row || row.count < maxFailures) return 0
  return Math.max(0, row.window_start + windowSeconds - nowSeconds)
}

// The first failure starts a window. After windowSeconds the row is deleted and counting starts over.
export async function recordFailure(
  db: D1Database,
  keys: string[],
  nowSeconds: number,
  windowSeconds: number,
): Promise<void> {
  const expiredBefore = nowSeconds - windowSeconds
  await db.batch([
    db.prepare('DELETE FROM login_attempts WHERE window_start <= ?1').bind(expiredBefore),
    ...keys.map((key) =>
      db
        .prepare(
          // Old rows were just deleted, so if the key already exists its window is still open.
          'INSERT INTO login_attempts (key, count, window_start) VALUES (?1, 1, ?2) ON CONFLICT (key) DO UPDATE SET count = count + 1',
        )
        .bind(key, nowSeconds),
    ),
  ])
}

export async function clearAttempts(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE key = ?1').bind(key).run()
}
