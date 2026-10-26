import { enqueueJob, type PipelineHook } from '@protobase/server'

// In the write's own transaction: the invoice and its job commit together or not at all.
export default (async (event, trx) => {
  if (event.resource.name !== 'invoices' || event.after?.status !== 'sent' || event.before?.status === 'sent') return
  const invoiceId = Number(event.after.id)
  await enqueueJob(trx, 'send-invoice', { invoiceId }, { key: `invoice:${invoiceId}` })
}) satisfies PipelineHook
