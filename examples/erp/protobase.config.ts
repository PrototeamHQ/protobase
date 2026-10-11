import { defineConfig } from '@protobase/server'
import * as config from './config'
import * as jobs from './config/jobs'
import { roles } from './config/roles'
import { auth, authenticate } from './auth/auth'

export default defineConfig({
  config,
  auth,
  authenticate,
  jobs,
  options: {
    roles,
    writeHooks: [
      // In the write's own transaction: the invoice and the check of its payment commit together or not at all.
      async (event, trx) => {
        const check = jobs.overdueCheck(event)
        if (check) await jobs.markInvoiceOverdue.enqueue(trx, { invoiceId: check.invoiceId }, { runAt: check.runAt, key: check.key, mode: 'replace' })
      },
    ],
  },
})
