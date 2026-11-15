import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { checkDefinition, definitionFromParts, partOfProblem, problemText, withCustomSteps, type CheckOptions, type Definition, type DefinitionParts } from '@protobase/workflows'
import { badRequest } from '../problem'
import type { PipelineHook } from '../types'
import type { TriggerJobs } from './triggers/trigger-jobs'
import { syncTrigger } from './triggers/trigger-sync'
import { saveConsent, type ConnectionConsent } from './connections/connection-consent'
import { definitionColumns, definitionOfRow } from './definition-columns'
import type { CustomStepTypes } from './custom-steps/custom-step-types'
import { wantCustomSteps } from './custom-steps/wanted-steps'

// The definition of a saved version, or nothing when the workflow has no such version.
const savedDefinition = async (trx: Db, schema: string, workflow: string, version: number) => {
  const { rows } = await sql<Record<string, unknown>>`select ${definitionColumns('v')} from ${sql.id(schema, 'versions')} v where v.workflow_id = ${workflow} and v.version = ${version}`.execute(trx)
  return rows[0] && definitionOfRow(rows[0])
}

/**
 * A definition with no steps as the check reads it: with one that ends the run at once, so its trigger and every other
 * field are checked all the same, and only the want of steps is let through.
 */
export const withStepsToCheck = (definition: unknown) => {
  const document = definition as Partial<Definition> | null
  const machine = document?.stateMachine
  if (!machine || typeof machine.States !== 'object' || machine.States === null || Array.isArray(machine.States) || Object.keys(machine.States).length > 0) return definition
  // In dataflow order a machine has no start, and a run ends once nothing is left to run
  if (document?.order === 'data') return machine.StartAt === undefined ? { ...(definition as Definition), stateMachine: { ...machine, States: { Done: { Type: 'Pass' } } } } : definition
  if (machine.StartAt !== '') return definition
  return { ...(definition as Definition), stateMachine: { ...machine, StartAt: 'Done', States: { Done: { Type: 'Succeed' } } } }
}

const refuseProblems = (definition: unknown, types: CheckOptions) => {
  const problems = checkDefinition(definition, types)
  if (problems.length === 0) return
  const errors = problems.map((problem) => ({ code: 'invalid-workflow', field: partOfProblem(problem.field), message: problemText(problem), params: { state: problem.state, field: problem.field } }))
  throw badRequest('invalid-workflow', `The workflow cannot be saved: ${problems.map(problemText).join('; ')}`, { problems, errors })
}

/**
 * Checks a workflow's definition on every save that changes it against the language's schema and the named-reads
 * profile, with the trigger and step types the app has, and keeps a changed definition as the version the table's
 * trigger numbered, saved by the caller, with the layout it has then. A save that moves only nodes checks and keeps nothing. A save leaves what is published alone: a write that sets `enabled_version`
 * publishes that saved version, checked again, and puts the workflow's trigger on it, and clearing it turns the
 * workflow off, which never depends on a definition still checking, as after an app update removed a plugin. A refusal is a 400
 * problem naming each state and field, also listed as `problems`, and as the `definition` field's `errors` with the
 * state and field in their `params`, for a form to show each on its step; the write rolls back. With `custom`, the
 * workflow's tenant's custom steps are step types too, read in the write's transaction, and the custom step versions
 * a published version uses are kept as wanted, for runners to prepare, until another is published or it is turned off.
 */
export const workflowSaveHook = (schema: string, types: CheckOptions, jobs: Pick<TriggerJobs, 'start' | 'stop'>, consent: ConnectionConsent, custom?: CustomStepTypes): PipelineHook => async (event, trx) => {
  if (event.resource.name !== 'workflows' || !event.after) return
  if (event.operation !== 'create' && event.operation !== 'update') return
  // The trigger numbers a new version only when the definition changed.
  const changed = event.operation === 'create' || event.after.version !== event.before?.version
  const enabled = event.after.enabled_version as number | null
  const publishing = enabled !== (event.before?.enabled_version ?? null)
  if (!changed && !publishing) return
  const id = String(event.after.id)
  // Turning a workflow off checks nothing
  const check = custom && (changed || enabled !== null) ? withCustomSteps(await custom(trx, event.after.tenant_id)).check(types) : types
  if (changed) {
    // A workflow starts with no steps; a version without any is kept, and refused as it is published or run.
    refuseProblems(withStepsToCheck(definitionFromParts(event.after as DefinitionParts)), check)
    // With its layout as it is now, so the version opens as it looked when it was saved
    await sql`insert into ${sql.id(schema, 'versions')} (workflow_id, version, state_machine, trigger, execution_order, connections, trace, layout, saved_by, tenant_id)
      select w.id, w.version, w.state_machine, w.trigger, w.execution_order, w.connections, w.trace, w.layout, ${String(event.user.id)}, w.tenant_id from ${sql.id(schema, 'workflows')} w where w.id = ${id}`.execute(trx)
  }
  if (!publishing) return
  if (enabled === null) {
    await saveConsent(trx, schema, id, null, null)
    await syncTrigger(trx, schema, jobs, event.after, undefined, null, types.connections)
    if (custom) await wantCustomSteps(trx, schema, id, undefined)
    return
  }
  const definition = await savedDefinition(trx, schema, id, enabled)
  if (!definition) throw badRequest('invalid-workflow', `Version ${enabled} of this workflow was never saved: set enabled_version to a saved version, or clear it to turn the workflow off`)
  refuseProblems(definition, check)
  const enabledBy = await consent(event.session, definition)
  await saveConsent(trx, schema, id, enabled, enabledBy)
  await syncTrigger(trx, schema, jobs, event.after, definition, enabledBy, types.connections)
  if (custom) await wantCustomSteps(trx, schema, id, definition)
}
