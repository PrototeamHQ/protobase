import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { QueryError, type QueryErrorCode } from '@protobase/query'
import { ConnectionsBusy, connectionsBusyProblem } from './connections-busy'
import { HttpProblem, problemResponse } from './problem'
import { StatementTimeout } from './statement-timeout'

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

/** An error from the database driver, pg's or PGlite's: its SQLSTATE, and the table it names, when it names one. */
type DatabaseError = { code: string; table?: string; schema?: string }

export const isDatabaseError = (error: unknown): error is DatabaseError =>
  error instanceof Error && /^[0-9A-Z]{5}$/.test(String((error as unknown as { code?: unknown }).code))

// Constraint and column names are left out: they can name a column the caller may not see.
const databaseProblem = (error: DatabaseError): HttpProblem | undefined => {
  // SQLSTATE 25006: the database is read-only, as during a deploy's write freeze; the write can be sent again shortly.
  if (error.code === '25006') return new HttpProblem(503, 'read-only', 'Service Unavailable', 'The app is read-only while it is being updated', {}, { 'Retry-After': '5' })
  // SQLSTATE 57014: Postgres stopped a query at its statement timeout; the error handler names the request that ran it.
  if (error.code === '57014') return new HttpProblem(504, 'statement-timeout', 'Gateway Timeout', 'A query ran longer than its statement timeout, so the database stopped it')
  if (error.code === '23505') return new HttpProblem(409, 'conflict', 'Conflict', 'A record with the same unique value already exists')
  if (error.code === '23503') return new HttpProblem(409, 'conflict', 'Conflict', 'The record points at, or is pointed at by, another record')
  // SQLSTATE 40P01: two writes locked the same records in opposite orders; Postgres rolled this one back, nothing written.
  if (error.code === '40P01') return new HttpProblem(409, 'conflict', 'Conflict', 'The record was written at the same time as another; send it again')
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
  : error instanceof ConnectionsBusy ? connectionsBusyProblem(error, 'The query')
  : undefined

// A stopped query's 504 names the request that ran it and the limit it ran into, unless it already names what ran.
const namedTimeout = (problem: HttpProblem, c: Context, statementTimeoutMs?: number) =>
  problem instanceof StatementTimeout
    ? problem
    : new StatementTimeout(`${c.req.method} ${c.req.path}`, statementTimeoutMs === undefined ? { kind: 'database' } : { kind: 'request', ms: statementTimeoutMs }, problem.extras)

/**
 * The single place where errors become responses: RFC 9457 problems, never raw error messages for unexpected failures.
 * Unexpected failures go to `onUnhandledError` as well, and so do a query stopped at its statement timeout
 * (`statementTimeoutMs`, the requests' own, when they set one) and a request that found every database connection
 * busy, as the problem that names the request.
 */
export const createErrorHandler = (onUnhandledError?: (error: unknown, request?: Request) => void, statementTimeoutMs?: number) => (error: Error, c: Context) => {
  if (error instanceof ConnectionsBusy) {
    const named = connectionsBusyProblem(error, `${c.req.method} ${c.req.path}`)
    onUnhandledError?.(named, c.req.raw)
    return problemResponse(named, c.req.path)
  }
  const known = problemOf(error)
  if (known?.slug === 'statement-timeout') {
    const named = namedTimeout(known, c, statementTimeoutMs)
    onUnhandledError?.(named, c.req.raw)
    return problemResponse(named, c.req.path)
  }
  if (known) return problemResponse(known, c.req.path)
  onUnhandledError?.(error, c.req.raw)
  return problemResponse(new HttpProblem(500, 'internal-error', titles[500]!, 'The server failed to handle the request'), c.req.path)
}
