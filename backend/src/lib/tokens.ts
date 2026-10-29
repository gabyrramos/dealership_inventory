import { toBase64Url } from './password'

// Random token that goes in the session cookie.
export function generateSessionToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

// We save the hash of the token in the database, not the token, so a leaked database can't be used to log in.
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
