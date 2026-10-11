import { sql } from 'kysely'
import { defineJob, type WriteEvent } from '@protobase/server'

/** An invoice still sent and unpaid once its due date has passed becomes overdue. */
export const markInvoiceOverdue = defineJob<{ invoiceId: string }>({
  name: 'mark-invoice-overdue',
  run: async ({ invoiceId }, { db }) => {
    await sql`update sales.invoices set status = 'overdue' where id = ${invoiceId} and status = 'sent' and due_at < current_date`.execute(db)
  },
})

/** Every night, the sent invoices that passed their due date, such as imported ones that never had a check enqueued. */
export const markOverdueInvoices = defineJob({
  name: 'mark-overdue-invoices',
  schedule: '0 2 * * *',
  timezone: 'Europe/Amsterdam',
  run: async (_, { db }) => {
    await sql`update sales.invoices set status = 'overdue' where status = 'sent' and due_at < current_date`.execute(db)
  },
})

const day = 86_400_000

/** For a sent invoice, the check that it is paid: the day after it is due, one waiting check per invoice. */
export const overdueCheck = (event: WriteEvent) => {
  if (event.resource.name !== 'invoices' || event.operation === 'delete' || event.after?.status !== 'sent') return undefined
  const invoiceId = String(event.after.id)
  return { invoiceId, runAt: new Date(Date.parse(String(event.after.dueAt)) + day), key: `invoice:${invoiceId}` }
}
