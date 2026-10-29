import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ErrorCode =
  | 'unauthenticated'
  | 'session_expired'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'unsupported_media_type'
  | 'validation_failed'
  | 'conflict'
  | 'internal_error'

export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return c.json({ error: { code, message, ...extra } }, status)
}
