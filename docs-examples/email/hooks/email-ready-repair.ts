import { enqueueJob, type PipelineHook } from '@protobase/server'

// The job commits with the write, or not at all: no email about a change that was rolled back.
export default (async (event, trx) => {
  if (event.resource.name !== 'repairs' || event.after?.status !== 'ready' || event.before?.status === 'ready') return
  await enqueueJob(trx, 'email-repair-ready', { repairId: Number(event.after.id) })
}) satisfies PipelineHook
