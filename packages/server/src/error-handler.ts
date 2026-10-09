import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { QueryError, type QueryErrorCode } from '@protobase/query'
import { HttpProblem, problemResponse } from './problem'

const titles: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  409: 'Conflict', 413: 'Payload Too Large', 415: 'Unsupported Media Type', 500: 'Internal Server Error',
}

const queryStatus: Partial<Record<QueryErrorCode, number>> = {
  missing_tenant: 403,
  no_statistics: 409,
  missing_extension: 501,
}

const queryProblem = (error: QueryError) => {
  const status = queryStatus[error.code] ?? 400
  return new HttpProblem(status, error.code.replaceAll('_', '-'), titles[status] ?? 'Not Implemented', error.message)
}

type DatabaseError = { code: string }

const isDatabaseError = (error: unknown): error is DatabaseError =>
  error instanceof Error && /^[0-9A-Z]{5}$/.test(String((error as unknown as { code?: unknown }).code))

// Constraint and column names are left out: they can name a column the caller may not see.
const databaseProblem = (error: DatabaseError): HttpProblem | undefined => {
  if (error.code === '57014') return new HttpProblem(504, 'statement-timeout', 'Gateway Timeout', 'The query exceeded the statement timeout')
  if (error.code === '23505') return new HttpProblem(409, 'conflict', 'Conflict', 'A record with the same unique value already exists')
  if (error.code === '23503') return new HttpProblem(409, 'conflict', 'Conflict', 'The record points at, or is pointed at by, another record')
  if (error.code === '23502') return new HttpProblem(400, 'invalid-record', 'Bad Request', 'A required column has no value')
  if (error.code === '23514') return new HttpProblem(400, 'invalid-record', 'Bad Request', 'A check constraint rejected the record')
  if (error.code.startsWith('22')) return new HttpProblem(400, 'invalid-value', 'Bad Request', 'A value has the wrong format for its column')
  return undefined
}

/** The problem an error stands for, when it is one the API knows how to report; unknown errors give `undefined`. */
export const problemOf = (error: unknown): HttpProblem | undefined =>
  error instanceof HttpProblem ? error
  : error instanceof QueryError ? queryProblem(error)
  : error instanceof HTTPException ? new HttpProblem(error.status, 'http-error', titles[error.status] ?? 'Error', error.message)
  : error instanceof SyntaxError ? new HttpProblem(400, 'malformed-json', 'Bad Request', 'The request body is not valid JSON')
  : isDatabaseError(error) ? databaseProblem(error)
  : undefined

/** The single place where errors become responses: RFC 9457 problems, never raw error messages for unexpected failures. */
export const createErrorHandler = (onUnhandledError?: (error: unknown) => void) => (error: Error, c: Context) => {
  const known = problemOf(error)
  if (known) return problemResponse(known, c.req.path)
  onUnhandledError?.(error)
  return problemResponse(new HttpProblem(500, 'internal-error', titles[500]!, 'The server failed to handle the request'), c.req.path)
}
