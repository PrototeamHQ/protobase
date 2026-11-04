import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { currentJobs } from '../jobs/current'
import type { TenantValue } from '../types'
import { checkRunInput } from './input-limits'
import { segmentJobName } from './segment-job'

export type StartWorkflowOptions = {
  /** The workflow's id. */
  workflow: string
  /** What its states read as `$states.context.Execution.Input`; at most 1 MiB as JSON, nested at most 64 deep. */
  input?: unknown
  /** The workflow's tenant, in an app with tenants. */
  tenant?: TenantValue
  /** Who or what started it, as the run records it. */
  startedBy?: string
  /**
   * Starts it once per workflow and key, such as `orders:42` for what a trigger found ready: a start with a key the
   * workflow has a run for already starts nothing and returns that run's id.
   */
  key?: string
  /** The schema of `workflows`, when the config names another. Default `workflows`. */
  schema?: string
}

/**
 * Starts a run of a workflow from the app's own code, such as a job or a write hook, and returns the run's id. In
 * `db`'s own transaction when it is one, so the run starts when the caller's writes commit, or not at all.
 */
export const startWorkflow = async (db: Db, { workflow, input, tenant, startedBy, key, schema = 'workflows' }: StartWorkflowOptions) => {
  checkRunInput(input)
  const job = currentJobs().definition(segmentJobName)
  if (!job) throw new Error('Workflows are not running in this app: add `workflows: {}` to protobase.config.ts')
  const runs = sql.id(schema, 'runs')
  const { rows } = await sql<{ id: string }>`insert into ${runs} (workflow_id, input, tenant_id, started_by, key)
    values (${workflow}, ${input === undefined ? null : JSON.stringify(input)}::jsonb, ${tenant === undefined ? null : String(tenant)}, ${startedBy ?? null}, ${key ?? null})
    on conflict (workflow_id, key) do nothing returning id`.execute(db)
  // The unique key holds against a start in another transaction too: the later one waits for it, then starts nothing.
  if (rows.length === 0) return (await sql<{ id: string }>`select id from ${runs} where workflow_id = ${workflow} and key = ${key!}`.execute(db)).rows[0]!.id
  const id = rows[0]!.id
  await job.enqueue(db, { run: id }, { key: id })
  return id
}
