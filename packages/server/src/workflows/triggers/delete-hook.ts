import { sql } from 'kysely'
import type { PipelineHook } from '../../types'
import type { TriggerJobs } from './trigger-jobs'

/**
 * As a workflow is deleted, in the delete's transaction: its trigger, which the delete left without a workflow, stops at
 * once, so no poll or call starts a run of it, and its stop job, queued in the same write, ends any subscription at its
 * provider and then removes it. The delete removed its webhook URL already.
 */
export const workflowDeleteHook = (schema: string, jobs: Pick<TriggerJobs, 'stop'>): PipelineHook => async (event, trx) => {
  if (event.resource.name !== 'workflows' || event.operation !== 'delete') return
  const { rows } = await sql<{ id: string }>`update ${sql.id(schema, 'triggers')} set status = 'stopping', generation = generation + 1, updated_at = now()
    where workflow_id is null and status <> 'stopping' returning id`.execute(trx)
  for (const { id } of rows) await jobs.stop.enqueue(trx, { trigger: id })
}
