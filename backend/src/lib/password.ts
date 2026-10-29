import {
  DEFAULT_ITERATIONS,
  HASH_BYTES,
  HASH_PREFIX,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  SALT_BYTES,
} from '../constants/password'

// Password hashing with PBKDF2 from Web Crypto (bcrypt and argon2 don't run on Workers without WASM).
// 20k iterations is low, but it keeps login under the free plan's CPU limit.
// The iteration count is saved inside each hash, so we can raise it later without breaking old passwords.
// Stored format: pbkdf2-sha256$<iterations>$<salt>$<hash>

const encoder = new TextEncoder()

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BYTES * 8,
  )
  return new Uint8Array(bits)
}

// Compares every byte instead of stopping at the first difference, so timing doesn't leak anything.
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function hashPassword(
  password: string,
  options: { iterations?: number; salt?: Uint8Array } = {},
): Promise<string> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new RangeError(`iterations must be an integer between ${MIN_ITERATIONS} and ${MAX_ITERATIONS}`)
  }
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, iterations)
  return `${HASH_PREFIX}$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`
}

// Returns false (instead of throwing) if the stored hash is malformed.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== HASH_PREFIX) return false
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return false
  try {
    const salt = fromBase64Url(parts[2])
    const expected = fromBase64Url(parts[3])
    const actual = await derive(password, salt, iterations)
    return constantTimeEqual(actual, expected)
  } catch {
    return false
  }
}
