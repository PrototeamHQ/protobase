import { enqueueJob, type PipelineHook, type WriteEvent } from '@protobase/server'

const day = 86_400_000

/** For a sent invoice, the check that it is paid: the day after it is due, one waiting check per invoice. */
export const overdueCheck = (event: WriteEvent) => {
  if (event.resource.name !== 'invoices' || event.operation === 'delete' || event.after?.status !== 'sent') return undefined
  const invoiceId = String(event.after.id)
  return { invoiceId, runAt: new Date(Date.parse(String(event.after.due_at)) + day), key: `invoice:${invoiceId}` }
}

// In the write's own transaction: the invoice and the check of its payment commit together or not at all.
export default (async (event, trx) => {
  const check = overdueCheck(event)
  if (check) await enqueueJob(trx, 'mark-invoice-overdue', { invoiceId: check.invoiceId }, { runAt: check.runAt, key: check.key, mode: 'replace' })
}) satisfies PipelineHook
