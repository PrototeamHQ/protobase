import { HttpProblem } from './problem'

/** How long a query of an API request may run unless the app sets `statementTimeoutMs`. */
export const defaultStatementTimeoutMs = 1_000

/**
 * How long a query of a function or job with `longQueries: true` may run: the most any query of an app may, which the
 * platform's pooler enforces as well.
 */
export const longQueryTimeoutMs = 30_000

/** SQLSTATE 57014: Postgres stopped a statement at its `statement_timeout`. */
export const isStatementTimeout = (error: unknown) =>
  error instanceof Error && (error as unknown as { code?: unknown }).code === '57014'

/**
 * The limit a stopped query ran into: an API request's `statementTimeoutMs`, the database's own (as the platform sets
 * for the app's role), or the long one a function or job opted into.
 */
export type QueryLimit = { kind: 'request'; ms: number } | { kind: 'database' } | { kind: 'long' }

const seconds = (ms: number) => `${ms / 1000} s`

/** What ran too long (`subject`, such as `GET /api/v1/tasks`), the limit, and the ways out. */
export const statementTimeoutDetail = (subject: string, limit: QueryLimit) => {
  if (limit.kind === 'long') {
    return `${subject} ran a query longer than ${seconds(longQueryTimeoutMs)}, the most a query may run, so the database stopped it. Make the query faster, or split the work into smaller steps, such as a job per batch.`
  }
  const over = limit.kind === 'request' ? seconds(limit.ms) : "the database's statement timeout"
  const longer = limit.kind === 'request' ? 'move the work into a function or job with longQueries: true' : 'give it longQueries: true'
  return `${subject} ran a query longer than ${over}, so the database stopped it. Make the query faster, such as with an index or a narrower filter, or ${longer}, whose queries may run up to ${seconds(longQueryTimeoutMs)}.`
}

/** The 504 of a query Postgres stopped, whose detail already names what ran too long. */
export class StatementTimeout extends HttpProblem {
  constructor(subject: string, limit: QueryLimit, extras: Record<string, unknown> = {}) {
    super(504, 'statement-timeout', 'Gateway Timeout', statementTimeoutDetail(subject, limit), extras)
  }
}

/** Runs `work`; a query of it the database stopped becomes the 504 that names `subject` and the limit it ran into. */
export const namingTimeouts = async <T>(subject: string, limit: QueryLimit, work: () => Promise<T>) => {
  try {
    return await work()
  } catch (error) {
    if (isStatementTimeout(error)) throw new StatementTimeout(subject, limit)
    throw error
  }
}
