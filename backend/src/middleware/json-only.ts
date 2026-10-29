import { createMiddleware } from 'hono/factory'
import { UNSAFE_METHODS } from '../constants/http'
import { ApiError } from '../lib/http'

export const jsonOnly = createMiddleware(async (c, next) => {
  if (UNSAFE_METHODS.has(c.req.method)) {
    const type = (c.req.header('content-type') ?? '').toLowerCase()
    if (!type.startsWith('application/json')) {
      throw new ApiError(415, 'unsupported_media_type', 'Send requests with Content-Type: application/json.')
    }
  }
  await next()
})
