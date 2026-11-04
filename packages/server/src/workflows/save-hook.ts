import { isDeepStrictEqual } from 'node:util'
import { sql } from 'kysely'
import { checkDefinition, problemText } from '@protobase/workflows'
import { badRequest } from '../problem'
import type { PipelineHook } from '../types'

/**
 * Checks a workflow's definition on every save that changes it, against the language's schema and the named-reads
 * profile, with the step types the app has, and keeps it as the workflow's next version, saved by the caller. A
 * refusal is a 400 problem naming each state and field, also listed as `problems`; the write rolls back.
 */
export const workflowSaveHook = (schema: string, stepTypes: readonly string[]): PipelineHook => async (event, trx) => {
  if (event.resource.name !== 'workflows' || !event.after) return
  if (event.operation !== 'create' && event.operation !== 'update') return
  if (event.operation === 'update' && isDeepStrictEqual(event.before?.definition, event.after.definition)) return
  const problems = checkDefinition(event.after.definition, { resources: stepTypes })
  if (problems.length > 0) throw badRequest('invalid-workflow', `The workflow cannot be saved: ${problems.map(problemText).join('; ')}`, { problems })
  const workflows = sql.id(schema, 'workflows')
  const versions = sql.id(schema, 'versions')
  const id = String(event.after.id)
  const savedBy = String(event.user.id)
  // The write holds the workflow's row, so a save of it in another transaction numbers its version after this one.
  await sql`with saved as (
      insert into ${versions} (workflow_id, version, definition, saved_by, tenant_id)
      select w.id, coalesce((select max(v.version) from ${versions} v where v.workflow_id = w.id), 0) + 1, w.definition, ${savedBy}, w.tenant_id
      from ${workflows} w where w.id = ${id}
      returning version
    )
    update ${workflows} set version = saved.version, saved_by = ${savedBy}, updated_at = now() from saved where id = ${id}`.execute(trx)
}
