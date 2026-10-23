import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { ConnectionsBusy } from './connections-busy'
import { createErrorHandler, problemOf } from './error-handler'
import { HttpProblem } from './problem'
import { StatementTimeout } from './statement-timeout'

/** An error as the database driver throws it: a message and a SQLSTATE. */
const databaseError = (message: string, code: string) => Object.assign(new Error(message), { code })

const answer = async (error: Error, statementTimeoutMs?: number) => {
  const reported = vi.fn()
  const hono = new Hono()
  hono.onError(createErrorHandler(reported, statementTimeoutMs))
  hono.get('/api/v1/tasks', () => {
    throw error
  })
  const response = await hono.request('/api/v1/tasks')
  return { response, body: await response.json(), reported }
}

describe('the error handler while the database is read-only', () => {
  it('answers a write refused with SQLSTATE 25006 with 503 and Retry-After, and reports nothing', async () => {
    const { response, body, reported } = await answer(databaseError('the app is read-only while it is being updated', '25006'))
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(body).toMatchObject({ type: 'urn:protobase:problem:read-only', title: 'Service Unavailable', status: 503 })
    expect(reported).not.toHaveBeenCalled()
  })

  it('keeps another database error with the same message a reported 500', async () => {
    const { response, reported } = await answer(databaseError('the app is read-only while it is being updated', '42601'))
    expect(response.status).toBe(500)
    expect(reported).toHaveBeenCalledOnce()
  })

  it('gives the 503 to a batch operation too, which keeps the problem and its headers', () => {
    expect(problemOf(databaseError('cannot execute INSERT in a read-only transaction', '25006'))).toMatchObject({ status: 503, headers: { 'Retry-After': '5' } })
  })
})

describe('the error handler on a deadlock', () => {
  it('answers SQLSTATE 40P01 with 409 conflict, names nothing from the database, and reports nothing', async () => {
    const { response, body, reported } = await answer(databaseError('deadlock detected on relation "vms"', '40P01'))
    expect(response.status).toBe(409)
    expect(body).toMatchObject({ type: 'urn:protobase:problem:conflict', detail: 'The record was written at the same time as another; send it again' })
    expect(JSON.stringify(body)).not.toContain('vms')
    expect(reported).not.toHaveBeenCalled()
  })
})

describe('the error handler when every database connection stayed busy', () => {
  it('answers 503 with Retry-After naming the request, and reports it as that 503', async () => {
    const { response, body, reported } = await answer(new ConnectionsBusy(3, 2_000))
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('1')
    expect(body).toMatchObject({
      type: 'urn:protobase:problem:connections-busy',
      detail: "GET /api/v1/tasks waited 2 s for one of the app's 3 database connections, which all stayed busy, so it did not run. Queries that run long or transactions left open hold them.",
    })
    expect(reported).toHaveBeenCalledWith(expect.objectContaining({ status: 503, message: body.detail }), expect.any(Request))
  })
})

describe('the error handler on a query stopped at its statement timeout', () => {
  const stopped = () => databaseError('canceling statement due to statement timeout', '57014')

  it('answers 504 naming the request, its limit and the ways out, and reports it as that 504', async () => {
    const { response, body, reported } = await answer(stopped(), 1_000)
    expect(response.status).toBe(504)
    expect(body).toMatchObject({
      type: 'urn:protobase:problem:statement-timeout',
      detail: 'GET /api/v1/tasks ran a query longer than 1 s, so the database stopped it. Make the query faster, such as with an index or a narrower filter, or move the work into a function or job with longQueries: true, whose queries may run up to 30 s.',
    })
    expect(reported).toHaveBeenCalledWith(expect.objectContaining({ status: 504, message: body.detail }), expect.any(Request))
  })

  it("names the database's own limit for a handler that sets none", async () => {
    const { body } = await answer(stopped())
    expect(body.detail).toMatch(/^GET \/api\/v1\/tasks ran a query longer than the database's statement timeout, so the database stopped it\./)
  })

  it('keeps what a batch adds, such as the operation that ran it', async () => {
    const { body } = await answer(new HttpProblem(504, 'statement-timeout', 'Gateway Timeout', 'A query ran longer than its statement timeout', { operation: 2 }), 1_000)
    expect(body).toMatchObject({ operation: 2, detail: expect.stringMatching(/^GET \/api\/v1\/tasks ran a query longer than 1 s/) })
  })

  it('keeps a 504 that already names what ran too long', async () => {
    const { body } = await answer(new StatementTimeout('POST /api/functions/import', { kind: 'long' }), 1_000)
    expect(body.detail).toMatch(/^POST \/api\/functions\/import ran a query longer than 30 s, the most a query may run/)
  })
})
