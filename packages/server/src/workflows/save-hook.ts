import { sql } from 'kysely'
import { checkDefinition, problemText } from '@protobase/workflows'
import { badRequest } from '../problem'
import type { PipelineHook } from '../types'

/**
 * Checks a workflow's definition on every save that changes it, against the language's schema and the named-reads
 * profile, with the step types the app has, and keeps it as the version the table's trigger numbered, saved by the
 * caller. A refusal is a 400 problem naming each state and field, also listed as `problems`; the write rolls back.
 */
export const workflowSaveHook = (schema: string, stepTypes: readonly string[]): PipelineHook => async (event, trx) => {
  if (event.resource.name !== 'workflows' || !event.after) return
  if (event.operation !== 'create' && event.operation !== 'update') return
  // The trigger numbers a new version only when the definition changed.
  if (event.operation === 'update' && event.after.version === event.before?.version) return
  const problems = checkDefinition(event.after.definition, { resources: stepTypes })
  if (problems.length > 0) throw badRequest('invalid-workflow', `The workflow cannot be saved: ${problems.map(problemText).join('; ')}`, { problems })
  await sql`insert into ${sql.id(schema, 'versions')} (workflow_id, version, definition, saved_by, tenant_id)
    select w.id, w.version, w.definition, ${String(event.user.id)}, w.tenant_id from ${sql.id(schema, 'workflows')} w where w.id = ${String(event.after.id)}`.execute(trx)
}
