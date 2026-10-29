import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import type { ErrorCode } from './errors'


export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'The request body must be valid JSON.')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const { fieldErrors, formErrors } = z.flattenError(parsed.error)
    throw new ApiError(400, 'validation_failed', 'Some fields are invalid.', { fieldErrors, formErrors })
  }
  return parsed.data
}
