import { FatalJobError, type JobRun } from '@protobase/server'

export default (async ({ invoiceId }, { db }) => {
  const invoice = await db.selectFrom('sales.invoices').select(['id', 'status']).where('id', '=', invoiceId).executeTakeFirst()
  // Retrying will not bring it back: fail for good.
  if (!invoice) throw new FatalJobError(`Invoice ${invoiceId} is gone`)
  // ... render the PDF and mail it
}) satisfies JobRun<{ invoiceId: number }>
