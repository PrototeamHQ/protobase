import { defineConfig } from '@protobase/config'

export default defineConfig({
  jobs: {
    // jobs/email-repair-quote.ts
    'email-repair-quote': { description: "Emails a customer their repair's quote as a PDF.", arguments: { repairId: 'integer' } },
  },
})
