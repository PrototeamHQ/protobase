import { defineConfig } from '@protobase/server'
import * as jobs from './jobs'

export default defineConfig({
  config: {},
  jobs,
  options: {
    writeHooks: [
      // The job commits with the write, or not at all: no email about a change that was rolled back.
      async (event, trx) => {
        if (event.resource.name !== 'repairs' || event.after?.status !== 'ready' || event.before?.status === 'ready') return
        await jobs.emailRepairReady.enqueue(trx, { repairId: Number(event.after.id) })
      },
    ],
  },
})
