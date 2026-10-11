import type { JobWithMetadata } from 'pg-boss'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineJob } from './define-job'
import { FatalJobError, runJob, throughWriteFreeze } from './run-job'

const db = {} as never

const fetched = (data: unknown, retryCount = 0) =>
  ({ id: 'j1', name: 'send-invoice', data, retryCount, retryLimit: 9, signal: new AbortController().signal }) as unknown as JobWithMetadata<unknown>

describe('runJob', () => {
  it('completes a job whose run returns, with its payload and attempt', async () => {
    const run = vi.fn()
    const job = defineJob({ name: 'send-invoice', payload: z.object({ invoiceId: z.number() }), run })
    expect(await runJob(job, fetched({ invoiceId: 1 }, 2), db)).toEqual({ id: 'j1', status: 'completed' })
    expect(run).toHaveBeenCalledWith({ invoiceId: 1 }, expect.objectContaining({ db, job: { id: 'j1', name: 'send-invoice', attempt: 3, maxAttempts: 10 } }))
  })

  it('fails a try that throws, keeping the error as its output', async () => {
    const job = defineJob({ name: 'send-invoice', run: () => { throw new Error('SMTP down') } })
    expect(await runJob(job, fetched(null), db)).toMatchObject({ id: 'j1', status: 'failed', output: { name: 'Error', message: 'SMTP down' } })
  })

  it('fails a job for good on a FatalJobError or a payload its schema refuses', async () => {
    const gone = defineJob({ name: 'send-invoice', run: () => { throw new FatalJobError('410 Gone') } })
    expect(await runJob(gone, fetched(null), db)).toMatchObject({ status: 'deadletter', output: { name: 'FatalJobError', message: '410 Gone' } })
    const typed = defineJob({ name: 'send-invoice', payload: z.object({ invoiceId: z.number() }), run: vi.fn() })
    expect(await runJob(typed, fetched({ invoiceId: 'x' }), db)).toMatchObject({
      status: 'deadletter',
      output: { message: expect.stringContaining('Job "send-invoice" has an invalid payload: invoiceId:') },
    })
  })

  it('passes no payload to a job enqueued without one', async () => {
    const run = vi.fn()
    await runJob(defineJob({ name: 'nightly', run }), fetched(null), db)
    expect(run.mock.calls[0]![0]).toBeUndefined()
  })
})

describe('throughWriteFreeze', () => {
  const readOnly = Object.assign(new Error('cannot execute UPDATE in a read-only transaction'), { code: '25006' })

  it('tries again while the database is read-only', async () => {
    const run = vi.fn().mockRejectedValueOnce(readOnly).mockRejectedValueOnce(readOnly).mockResolvedValue(undefined)
    await throughWriteFreeze(run, new AbortController().signal, 1)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('gives up when the try is aborted, and on any other error at once', async () => {
    const controller = new AbortController()
    const run = vi.fn(async () => {
      controller.abort()
      throw readOnly
    })
    await expect(throughWriteFreeze(run, controller.signal, 1)).rejects.toBe(readOnly)
    const other = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(throughWriteFreeze(other, new AbortController().signal, 1)).rejects.toThrow('boom')
    expect(other).toHaveBeenCalledTimes(1)
  })
})
