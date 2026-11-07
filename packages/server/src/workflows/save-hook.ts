import { sql } from 'kysely'
import { checkDefinition, problemText, type CheckOptions, type Definition } from '@protobase/workflows'
import { badRequest } from '../problem'
import type { PipelineHook } from '../types'
import type { TriggerJobs } from './triggers/trigger-jobs'
import { syncTrigger } from './triggers/trigger-sync'
import { saveConsent, type ConnectionConsent } from './connections/connection-consent'

/**
 * Checks a workflow's definition on every save that changes it, and as it is turned on (not off), against the language's schema
 * and the named-reads profile, with the trigger and step types the app has, and keeps a changed definition as the
 * version the table's trigger numbered, saved by the caller. Then it keeps the workflow's trigger in step with its
 * enabled version. A refusal is a 400 problem naming each state and field, also listed as `problems`, and as the
 * `definition` field's `errors` with the state and field in their `params`, for a form to show each on its step; the
 * write rolls back.
 */
export const workflowSaveHook = (schema: string, types: CheckOptions, jobs: Pick<TriggerJobs, 'start' | 'stop'>, consent: ConnectionConsent): PipelineHook => async (event, trx) => {
  if (event.resource.name !== 'workflows' || !event.after) return
  if (event.operation !== 'create' && event.operation !== 'update') return
  // The trigger numbers a new version only when the definition changed.
  const changed = event.operation === 'create' || event.after.version !== event.before?.version
  const enabling = event.after.enabled_version !== (event.before?.enabled_version ?? null)
  if (!changed && !enabling) return
  // Turning a workflow off never depends on its definition still checking, as after an app update removed a plugin.
  const problems = changed || event.after.enabled_version !== null ? checkDefinition(event.after.definition, types) : []
  if (problems.length > 0) {
    const errors = problems.map((problem) => ({ code: 'invalid-workflow', field: 'definition', message: problemText(problem), params: { state: problem.state, field: problem.field } }))
    throw badRequest('invalid-workflow', `The workflow cannot be saved: ${problems.map(problemText).join('; ')}`, { problems, errors })
  }
  if (changed) {
    await sql`insert into ${sql.id(schema, 'versions')} (workflow_id, version, definition, saved_by, tenant_id)
      select w.id, w.version, w.definition, ${String(event.user.id)}, w.tenant_id from ${sql.id(schema, 'workflows')} w where w.id = ${String(event.after.id)}`.execute(trx)
  }
  const id = String(event.after.id)
  const enabled = event.after.enabled_version as number | null
  const enabledBy = enabled === null ? null : await consent(event.session, event.after.definition as Definition)
  await saveConsent(trx, schema, id, enabled, enabledBy)
  await syncTrigger(trx, schema, jobs, event.after, enabledBy, types.connections)
}
