import { FatalJobError, type JobPayload, type JobRun } from '@protobase/server'
import type config from '../protobase.config'

export default (async ({ invoiceId }, { db }) => {
  const invoice = await db.selectFrom('sales.invoices').select(['id', 'status']).where('id', '=', invoiceId).executeTakeFirst()
  // Retrying will not bring it back: fail for good.
  if (!invoice) throw new FatalJobError(`Invoice ${invoiceId} is gone`)
  // ... render the PDF and mail it
}) satisfies JobRun<JobPayload<typeof config, 'send-invoice'>>
