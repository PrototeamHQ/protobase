import { sql } from 'kysely'
import { manifestProblems, type CustomStepManifest } from '@protobase/workflows'
import { badRequest } from '../../problem'
import type { PipelineHook } from '../../types'

/** The resource of the custom steps, whose writes the hook checks. */
export const customStepsResource = 'workflow_custom_steps'

/**
 * Checks a custom step's manifest on every create and update (`manifestProblems`), and keeps a changed manifest as the
 * version the table's trigger numbered, saved by the caller, in the write's transaction. A refusal is a 400 problem
 * naming each field, also listed as `problems`, and as `errors` by the record's field with the part in their `params`,
 * as a refused workflow is; the write rolls back.
 */
export const customStepSaveHook = (schema: string): PipelineHook => async (event, trx) => {
  if (event.resource.name !== customStepsResource || !event.after) return
  if (event.operation !== 'create' && event.operation !== 'update') return
  const problems = manifestProblems(event.after as CustomStepManifest)
  if (problems.length > 0) {
    const texts = problems.map((problem) => `${problem.field} ${problem.message}`)
    const errors = problems.map((problem, index) => ({ code: 'invalid-custom-step', field: problem.field.split('.')[0]!, message: texts[index]!, params: { field: problem.field } }))
    throw badRequest('invalid-custom-step', `The custom step cannot be saved: ${texts.join('; ')}`, { problems, errors })
  }
  // The trigger numbers a new version only when the manifest changed.
  if (event.operation === 'update' && event.after.version === event.before?.version) return
  await sql`insert into ${sql.id(schema, 'custom_step_versions')} (custom_step_id, version, tenant_id, name, label, description, kind, container, input, output, error_prefix, errors, saved_by)
    select c.id, c.version, c.tenant_id, c.name, c.label, c.description, c.kind, c.container, c.input, c.output, c.error_prefix, c.errors, ${String(event.user.id)}
    from ${sql.id(schema, 'custom_steps')} c where c.id = ${String(event.after.id)}`.execute(trx)
}
