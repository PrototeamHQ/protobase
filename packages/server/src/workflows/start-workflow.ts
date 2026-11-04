import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { currentJobs } from '../jobs/current'
import type { TenantValue } from '../types'
import { segmentJobName } from './segment-job'

export type StartWorkflowOptions = {
  /** The workflow's id. */
  workflow: string
  /** What its states read as `$trigger`. */
  input?: unknown
  /** The workflow's tenant, in an app with tenants. */
  tenant?: TenantValue
  /** Who or what started it, as the run records it. */
  startedBy?: string
  /** The schema of `workflows`, when the config names another. Default `workflows`. */
  schema?: string
}

/**
 * Starts a run of a workflow from the app's own code, such as a job or a write hook, and returns the run's id. In
 * `db`'s own transaction when it is one, so the run starts when the caller's writes commit, or not at all.
 */
export const startWorkflow = async (db: Db, { workflow, input, tenant, startedBy, schema = 'workflows' }: StartWorkflowOptions) => {
  const job = currentJobs().definition(segmentJobName)
  if (!job) throw new Error('Workflows are not running in this app: add `workflows: {}` to protobase.config.ts')
  const { rows } = await sql<{ id: string }>`insert into ${sql.id(schema, 'runs')} (workflow_id, input, tenant_id, started_by)
    values (${workflow}, ${input === undefined ? null : JSON.stringify(input)}::jsonb, ${tenant === undefined ? null : String(tenant)}, ${startedBy ?? null}) returning id`.execute(db)
  const id = rows[0]!.id
  await job.enqueue(db, { run: id }, { key: id })
  return id
}
