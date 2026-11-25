import type { JobWithMetadata } from 'pg-boss'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineJob } from './define-job'
import { jobData } from './job-data'
import { FatalJobError, runJob, throughWriteFreeze } from './run-job'

const db = {} as never
const dbFor = () => db

const fetched = (data: unknown, retryCount = 0) =>
  ({ id: 'j1', name: 'send-invoice', data, retryCount, retryLimit: 9, startedOn: new Date(0), signal: new AbortController().signal }) as unknown as JobWithMetadata<unknown>

describe('runJob', () => {
  it('completes a job whose run returns, with its payload and attempt', async () => {
    const run = vi.fn()
    const job = defineJob({ name: 'send-invoice', payload: z.object({ invoiceId: z.number() }), run })
    expect(await runJob(job, fetched({ invoiceId: 1 }, 2), dbFor)).toEqual({ id: 'j1', status: 'completed' })
    expect(run).toHaveBeenCalledWith({ invoiceId: 1 }, expect.objectContaining({ db, job: { id: 'j1', name: 'send-invoice', attempt: 3, maxAttempts: 10, startedOn: new Date(0) } }))
  })

  it('fails a try that throws, keeping the error as its output', async () => {
    const job = defineJob({ name: 'send-invoice', run: () => { throw new Error('SMTP down') } })
    expect(await runJob(job, fetched(null), dbFor)).toMatchObject({ id: 'j1', status: 'failed', output: { name: 'Error', message: 'SMTP down' } })
  })

  it('fails a job for good on a FatalJobError or a payload its schema refuses', async () => {
    const gone = defineJob({ name: 'send-invoice', run: () => { throw new FatalJobError('410 Gone') } })
    expect(await runJob(gone, fetched(null), dbFor)).toMatchObject({ status: 'deadletter', output: { name: 'FatalJobError', message: '410 Gone' } })
    const typed = defineJob({ name: 'send-invoice', payload: z.object({ invoiceId: z.number() }), run: vi.fn() })
    expect(await runJob(typed, fetched({ invoiceId: 'x' }), dbFor)).toMatchObject({
      status: 'deadletter',
      output: { message: expect.stringContaining('Job "send-invoice" has an invalid payload: invoiceId:') },
    })
  })

  it("gives the job the app's mailer, and none when the app has no mail", async () => {
    const run = vi.fn()
    const mail = { send: vi.fn() }
    await runJob(defineJob({ name: 'send-invoice', run }), fetched(null), dbFor, { mail })
    expect(run.mock.calls[0]![1].mail).toBe(mail)
    await runJob(defineJob({ name: 'send-invoice', run }), fetched(null), dbFor)
    expect(run.mock.calls[1]![1]).not.toHaveProperty('mail')
  })

  it('gives the job the notification send only when the app has one', async () => {
    const run = vi.fn()
    const sendNotification = vi.fn()
    await runJob(defineJob({ name: 'send-invoice', run }), fetched(null), dbFor, { sendNotification })
    expect(run.mock.calls[0]![1].sendNotification).toBe(sendNotification)
    await runJob(defineJob({ name: 'send-invoice', run }), fetched(null), dbFor)
    expect(run.mock.calls[1]![1]).not.toHaveProperty('sendNotification')
  })

  it("gives the job the app's decryptField bound to the job, and one that names what is missing without it", async () => {
    const read = vi.fn(async () => 'cleartext')
    const decryptField = vi.fn(() => read)
    let value: unknown
    await runJob(defineJob({ name: 'dispatch-backup', run: async (_payload, context) => { value = await context.decryptField('targets', 7, 'password') } }), fetched(null), dbFor, { decryptField })
    expect(decryptField).toHaveBeenCalledWith({ job: 'dispatch-backup' })
    expect(read).toHaveBeenCalledWith('targets', 7, 'password')
    expect(value).toBe('cleartext')
    const without = await runJob(defineJob({ name: 'dispatch-backup', run: (_payload, context) => context.decryptField('targets', 7, 'password').then(() => {}) }), fetched(null), dbFor)
    expect(without).toMatchObject({ status: 'failed', output: { message: `Job "dispatch-backup" cannot decrypt fields: startJobs was not given the app's decryptField` } })
  })

  it('names the job in the output of a try whose query the database stopped', async () => {
    const stopped = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
    const job = defineJob({ name: 'nightly-report', run: () => { throw stopped } })
    expect(await runJob(job, fetched(null), dbFor)).toMatchObject({
      status: 'failed',
      output: { message: expect.stringMatching(/^Job "nightly-report" ran a query longer than the database's statement timeout, so the database stopped it\. .*longQueries: true/) },
    })
  })

  it('gives the job a db in the organization stored with it, and its payload alone', async () => {
    const run = vi.fn()
    const dbFor = vi.fn(() => db)
    await runJob(defineJob({ name: 'send-invoice', run }), fetched(jobData({ invoiceId: 1 }, 'org_a')), dbFor)
    expect(dbFor).toHaveBeenCalledWith('org_a')
    expect(run).toHaveBeenCalledWith({ invoiceId: 1 }, expect.objectContaining({ db }))
  })

  it('gives a job stored without an organization, such as from SQL or a schedule, a db in none', async () => {
    const dbFor = vi.fn(() => db)
    await runJob(defineJob({ name: 'send-invoice', run: vi.fn() }), fetched({ invoiceId: 1 }), dbFor)
    await runJob(defineJob({ name: 'nightly', run: vi.fn() }), fetched(null), dbFor)
    expect(dbFor.mock.calls).toEqual([[undefined], [undefined]])
  })

  it('passes no payload to a job enqueued without one', async () => {
    const run = vi.fn()
    await runJob(defineJob({ name: 'nightly', run }), fetched(null), dbFor)
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
