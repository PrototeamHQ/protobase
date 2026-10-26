import { defineConfig } from '@protobase/config'

export default defineConfig({
  jobs: {
    // jobs/email-repair-ready.ts
    'email-repair-ready': { description: 'Emails a customer that their repair is ready for pickup.', arguments: { repairId: 'integer' } },
  },
  // hooks/email-ready-repair.ts
  writeHooks: ['email-ready-repair'],
})
