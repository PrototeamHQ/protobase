import { describe, expect, it } from 'vitest'
import type { JobRun, WriteEvent } from '@protobase/server'
import { declaredJob } from '@protobase/server/internal'
import queueSentInvoice from './jobs/hooks/queue-sent-invoice'
import config from './jobs/protobase.config'

// The documentation shows these files; this keeps what it says about them true.

const sent = { operation: 'update', resource: { name: 'invoices' }, user: { id: 1, roles: [] }, before: { status: 'draft' }, after: { id: '7', status: 'sent' } } as unknown as WriteEvent

// The jobs as protobase.config.ts declares them, each run from its jobs/<name>.ts.
const jobs = Object.fromEntries(Object.entries(config.jobs!).map(([name, declaration]) => [name, declaredJob(name, declaration, async () => (await import(`./jobs/jobs/${name}.ts`)).default as JobRun)]))

describe('jobs', () => {
  it('are declared in protobase.config.ts, each with a run in jobs/<name>.ts', async () => {
    expect(Object.keys(jobs)).toEqual(['send-invoice', 'sync-customer', 'remind-overdue'])
    for (const name of Object.keys(jobs)) expect((await import(`./jobs/jobs/${name}.ts`)).default).toBeTypeOf('function')
    expect(jobs['remind-overdue']!.options).toMatchObject({ schedule: '0 7 * * *', timezone: 'Europe/Amsterdam' })
    expect(jobs['sync-customer']!.options.ordered).toBe(true)
  })

  it('check their arguments', async () => {
    const schema = jobs['send-invoice']!.options.payload!['~standard']
    expect(await schema.validate({ invoiceId: 7 })).toEqual({ value: { invoiceId: 7 } })
    expect((await schema.validate({ invoiceId: '7' })).issues).toHaveLength(1)
  })

  it('are enqueued by the write hook of a sent invoice, which needs the jobs running', async () => {
    expect(config.writeHooks).toEqual(['queue-sent-invoice'])
    await expect(queueSentInvoice(sent, {} as never)).rejects.toThrow('Jobs are not running in this process')
    await expect(queueSentInvoice({ ...sent, before: { status: 'sent' } }, {} as never)).resolves.toBeUndefined()
  })
})
