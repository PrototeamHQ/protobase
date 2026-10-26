import { enqueueJob, type EnqueueJob, type PipelineHook } from '@protobase/server'
import type config from '../protobase.config'

// enqueueJob, typed with the config's jobs: a name it does not declare, or a payload that does not fit, fails to compile.
const enqueue: EnqueueJob<typeof config> = enqueueJob

// In the write's own transaction: the invoice and its job commit together or not at all.
export default (async (event, trx) => {
  if (event.resource.name !== 'invoices' || event.after?.status !== 'sent' || event.before?.status === 'sent') return
  const invoiceId = Number(event.after.id)
  await enqueue(trx, 'send-invoice', { invoiceId }, { key: `invoice:${invoiceId}` })
}) satisfies PipelineHook
