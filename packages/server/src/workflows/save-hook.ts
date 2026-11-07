import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { checkDefinition, problemText, type CheckOptions, type Definition } from '@protobase/workflows'
import { badRequest } from '../problem'
import type { PipelineHook } from '../types'
import type { TriggerJobs } from './triggers/trigger-jobs'
import { syncTrigger } from './triggers/trigger-sync'
import { saveConsent, type ConnectionConsent } from './connections/connection-consent'

// The definition of a saved version, or nothing when the workflow has no such version.
const savedDefinition = async (trx: Db, schema: string, workflow: string, version: number) => {
  const { rows } = await sql<{ definition: Definition }>`select definition from ${sql.id(schema, 'versions')} where workflow_id = ${workflow} and version = ${version}`.execute(trx)
  return rows[0]?.definition
}

const refuseProblems = (definition: unknown, types: CheckOptions) => {
  const problems = checkDefinition(definition, types)
  if (problems.length === 0) return
  const errors = problems.map((problem) => ({ code: 'invalid-workflow', field: 'definition', message: problemText(problem), params: { state: problem.state, field: problem.field } }))
  throw badRequest('invalid-workflow', `The workflow cannot be saved: ${problems.map(problemText).join('; ')}`, { problems, errors })
}

/**
 * Checks a workflow's definition on every save that changes it against the language's schema and the named-reads
 * profile, with the trigger and step types the app has, and keeps a changed definition as the version the table's
 * trigger numbered, saved by the caller. A save leaves what is published alone: a write that sets `enabled_version`
 * publishes that saved version, checked again, and puts the workflow's trigger on it, and clearing it turns the
 * workflow off, which never depends on a definition still checking, as after an app update removed a plugin. A refusal is a 400
 * problem naming each state and field, also listed as `problems`, and as the `definition` field's `errors` with the
 * state and field in their `params`, for a form to show each on its step; the write rolls back.
 */
export const workflowSaveHook = (schema: string, types: CheckOptions, jobs: Pick<TriggerJobs, 'start' | 'stop'>, consent: ConnectionConsent): PipelineHook => async (event, trx) => {
  if (event.resource.name !== 'workflows' || !event.after) return
  if (event.operation !== 'create' && event.operation !== 'update') return
  // The trigger numbers a new version only when the definition changed.
  const changed = event.operation === 'create' || event.after.version !== event.before?.version
  const enabled = event.after.enabled_version as number | null
  const publishing = enabled !== (event.before?.enabled_version ?? null)
  if (!changed && !publishing) return
  const id = String(event.after.id)
  if (changed) {
    // A workflow starts with no steps; a version without any is kept, and refused as it is published or run.
    if (Object.keys((event.after.definition as Definition).stateMachine?.States ?? { state: true }).length > 0) refuseProblems(event.after.definition, types)
    await sql`insert into ${sql.id(schema, 'versions')} (workflow_id, version, definition, saved_by, tenant_id)
      select w.id, w.version, w.definition, ${String(event.user.id)}, w.tenant_id from ${sql.id(schema, 'workflows')} w where w.id = ${id}`.execute(trx)
  }
  if (!publishing) return
  if (enabled === null) {
    await saveConsent(trx, schema, id, null, null)
    await syncTrigger(trx, schema, jobs, event.after, undefined, null, types.connections)
    return
  }
  const definition = await savedDefinition(trx, schema, id, enabled)
  if (!definition) throw badRequest('invalid-workflow', `Version ${enabled} of this workflow was never saved: set enabled_version to a saved version, or clear it to turn the workflow off`)
  refuseProblems(definition, types)
  const enabledBy = await consent(event.session, definition)
  await saveConsent(trx, schema, id, enabled, enabledBy)
  await syncTrigger(trx, schema, jobs, event.after, definition, enabledBy, types.connections)
}
