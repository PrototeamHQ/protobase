import { defineConfig } from '@protobase/server'
import * as jobs from './jobs'

export default defineConfig({
  config: {},
  jobs, // run by the worker in `protobase dev` and `protobase serve`
  options: {
    writeHooks: [
      // In the write's own transaction: the invoice and its job commit together or not at all.
      async (event, trx) => {
        if (event.resource.name !== 'invoices' || event.after?.status !== 'sent' || event.before?.status === 'sent') return
        const invoiceId = Number(event.after.id)
        await jobs.sendInvoice.enqueue(trx, { invoiceId }, { key: `invoice:${invoiceId}` })
      },
    ],
  },
})
