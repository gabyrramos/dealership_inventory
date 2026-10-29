// Hashing settings. The iteration count is saved inside each hash, so DEFAULT_ITERATIONS can be raised later.
export const DEFAULT_ITERATIONS = 20_000
export const MIN_ITERATIONS = 1_000
export const MAX_ITERATIONS = 100_000
export const SALT_BYTES = 16
export const HASH_BYTES = 32
export const HASH_PREFIX = 'pbkdf2-sha256'

// Hash of a throwaway password. Login checks against it when the email doesn't exist, so an
// unknown email takes as long as a wrong password. It must use DEFAULT_ITERATIONS (20000 below).
export const DUMMY_PASSWORD_HASH = 'pbkdf2-sha256$20000$BwcHBwcHBwcHBwcHBwcHBw$-e53wEHTNSVXjrcNMQWFfTsQNjAZ0n6Vtwa7swh0zew'
