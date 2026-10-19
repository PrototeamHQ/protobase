import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createErrorHandler, problemOf } from './error-handler'

/** An error as the database driver throws it: a message and a SQLSTATE. */
const databaseError = (message: string, code: string) => Object.assign(new Error(message), { code })

const answer = async (error: Error) => {
  const reported = vi.fn()
  const hono = new Hono()
  hono.onError(createErrorHandler(reported))
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
