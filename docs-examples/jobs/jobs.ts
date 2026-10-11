import { defineJob, FatalJobError } from '@protobase/server'
import { z } from 'zod'

export const sendInvoice = defineJob({
  name: 'send-invoice',
  payload: z.object({ invoiceId: z.number() }),
  maxAttempts: 10, // then kept as failed, with its last error
  retryDelay: '30 seconds', // doubling with each retry, up to maxRetryDelay
  run: async ({ invoiceId }, { db }) => {
    const invoice = await db.selectFrom('sales.invoices').select(['id', 'status']).where('id', '=', invoiceId).executeTakeFirst()
    // Retrying will not bring it back: fail for good.
    if (!invoice) throw new FatalJobError(`Invoice ${invoiceId} is gone`)
    // ... render the PDF and mail it
  },
})

// One at a time per customer, in the order the changes were made.
export const syncCustomer = defineJob({
  name: 'sync-customer',
  ordered: true,
  payload: z.object({ customerId: z.number(), fields: z.array(z.string()) }),
  run: async ({ customerId, fields }) => {
    // ... push the changed fields to the CRM
  },
})
