import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { Definition } from '@protobase/workflows'
import { badRequest } from '../../problem'
import type { Row } from '../../types'
import type { TriggerJobs } from './trigger-jobs'

// The trigger a definition runs on: its type and input, or none for `manual`.
const triggerOf = (definition: unknown) => {
  const [type, input] = Object.entries((definition as Definition).trigger)[0]!
  return type === 'manual' ? undefined : { type, input }
}

/**
 * Keeps a workflow's trigger row in step with its enabled version, in the write's transaction, queueing its jobs in that
 * same write: turning it on inserts a running trigger and queues its start; a new version with the same type and input
 * keeps the row, so its state carries over; any other change, or turning it off, stops the old row and starts a new one.
 * Only the current version can be turned on.
 */
export const syncTrigger = async (trx: Db, schema: string, jobs: Pick<TriggerJobs, 'start' | 'stop'>, workflow: Row) => {
  const enabled = workflow.enabled_version as number | null
  if (enabled !== null && enabled !== workflow.version) throw badRequest('invalid-workflow', `Only the current version can be enabled: set enabled_version to ${String(workflow.version)}, or clear it to turn the workflow off`)
  const wanted = enabled === null ? undefined : triggerOf(workflow.definition)
  const triggers = sql.id(schema, 'triggers')
  const id = String(workflow.id)
  const { rows } = await sql<{ id: string; same: boolean }>`select id, (type = ${wanted?.type ?? null} and input = ${JSON.stringify(wanted?.input ?? null)}::jsonb and connection_id is null) as same
    from ${triggers} where workflow_id = ${id} and status <> 'stopping'`.execute(trx)
  const existing = rows[0]
  if (existing?.same) {
    await sql`update ${triggers} set version = ${enabled}, updated_at = now() where id = ${existing.id}`.execute(trx)
    return
  }
  if (existing) {
    await sql`update ${triggers} set status = 'stopping', generation = generation + 1, updated_at = now() where id = ${existing.id}`.execute(trx)
    await jobs.stop.enqueue(trx, { trigger: existing.id })
  }
  if (!wanted) return
  const inserted = await sql<{ id: string }>`insert into ${triggers} (workflow_id, version, tenant_id, type, input, status, generation, consecutive_failures)
    values (${id}, ${enabled}, ${(workflow.tenant_id as string | null) ?? null}, ${wanted.type}, ${JSON.stringify(wanted.input)}::jsonb, 'active', 1, 0) returning id`.execute(trx)
  const trigger = inserted.rows[0]!.id
  await jobs.start.enqueue(trx, { trigger, generation: 1 }, { key: `trigger:${trigger}` })
}
