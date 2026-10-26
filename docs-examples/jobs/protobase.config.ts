import { defineConfig } from '@protobase/config'

export default defineConfig({
  // Each job's run is jobs/<name>.ts; the worker in `protobase dev` and `protobase serve` runs them.
  jobs: {
    'send-invoice': {
      description: 'Renders an invoice as a PDF and mails it to the customer.',
      arguments: { invoiceId: 'integer' },
      maxAttempts: 10, // then kept as failed, with its last error
      retryDelay: '30 seconds', // doubling with each retry, up to maxRetryDelay
    },
    'sync-customer': {
      description: 'Pushes the changed fields of a customer to the CRM.',
      arguments: { customerId: 'integer', fields: 'json' },
      ordered: true, // one at a time per customer, in the order the changes were made
    },
    'remind-overdue': {
      description: 'Mails a reminder for every invoice past its due date.',
      schedule: '0 7 * * *', // every morning at 7: one run per time, however many workers run
      timezone: 'Europe/Amsterdam',
    },
  },
  // hooks/queue-sent-invoice.ts
  writeHooks: ['queue-sent-invoice'],
})
