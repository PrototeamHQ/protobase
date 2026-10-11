import { describe, expect, it } from 'vitest'
import { jobDefinitions, type WriteEvent } from '@protobase/server'
import { remindOverdue, sendInvoice, syncCustomer } from './jobs/jobs'
import project from './jobs/protobase.config'

// The documentation shows these files; this keeps what it says about them true.

const sent = { operation: 'update', resource: { name: 'invoices' }, user: { id: 1, roles: [] }, before: { status: 'draft' }, after: { id: '7', status: 'sent' } } as unknown as WriteEvent

describe('jobs', () => {
  it('are the jobs module protobase.config.ts passes', () => {
    expect(jobDefinitions(project.jobs!)).toEqual([sendInvoice, syncCustomer, remindOverdue])
    expect(remindOverdue.options).toMatchObject({ schedule: '0 7 * * *', timezone: 'Europe/Amsterdam' })
    expect(syncCustomer.options.ordered).toBe(true)
  })

  it('check their payload', async () => {
    const schema = sendInvoice.options.payload!['~standard']
    expect(await schema.validate({ invoiceId: 7 })).toEqual({ value: { invoiceId: 7 } })
    expect((await schema.validate({ invoiceId: '7' })).issues).toHaveLength(1)
  })

  it('are enqueued by the write hook of a sent invoice, which needs the jobs running', async () => {
    const [hook] = project.options!.writeHooks!
    await expect(hook!(sent, {} as never)).rejects.toThrow('Jobs are not running in this process')
    await expect(hook!({ ...sent, before: { status: 'sent' } }, {} as never)).resolves.toBeUndefined()
  })
})
