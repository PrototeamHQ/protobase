import { describe, expect, it } from 'vitest'
import { statementTimeoutDetail } from './statement-timeout'

const lockWait = 'It may also have waited on a lock another transaction held, such as a migration while a deploy runs.'

describe('statementTimeoutDetail', () => {
  it("names a request's limit, a lock held by another transaction, and the ways out", () => {
    expect(statementTimeoutDetail('GET /api/v1/tasks/7', { kind: 'request', ms: 1_000 })).toBe(
      `GET /api/v1/tasks/7 ran a query longer than 1 s, so the database stopped it. ${lockWait} Make the query faster, such as with an index or a narrower filter, or move the work into a function or job with longQueries: true, whose queries may run up to 30 s.`,
    )
  })

  it("names a lock held by another transaction under the database's own limit", () => {
    expect(statementTimeoutDetail('POST /api/functions/import', { kind: 'database' })).toContain(lockWait)
  })

  it('names a lock held by another transaction under the long limit', () => {
    expect(statementTimeoutDetail('Job "nightly-report"', { kind: 'long' })).toContain(lockWait)
  })
})
