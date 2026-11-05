import { checkFilter, parseFilter, type ResourceModel } from '@protobase/schema'
import { isCaptured } from '../../changes/capture-sql'
import { readyWhen } from './ready-when'

/** What a ready trigger declares: the resource, its `when` and the fields of its ready key. */
export type ReadySpec = { resource: string; when?: string; key?: string[] }

type Problem = { field?: string; message: string }

const timeTypes = new Set(['timestamp', 'date'])

/**
 * Why a ready trigger cannot run on the app's resources, checked as a workflow is saved: a resource that records no
 * changes (so no write reaches the trigger), a `when` that does not check against it (a field that is not indexed for
 * filtering among them, as for list filters), `now()` outside a time term, and key fields it does not have.
 */
export const readyProblems = (models: (name: string) => ResourceModel | undefined, spec: ReadySpec): Problem[] => {
  const model = models(spec.resource)
  if (!model) return [{ field: 'resource', message: `"${spec.resource}" is not a resource of this app` }]
  const problems: Problem[] = []
  if (!isCaptured(model)) problems.push({ field: 'resource', message: `${spec.resource} records no changes, so no write reaches a trigger: declare events on it` })
  for (const name of spec.key ?? []) if (!model.fields[name]) problems.push({ field: 'key', message: `${spec.resource} has no field "${name}"` })
  if (spec.when === undefined) return problems
  const split = readyWhen(spec.when)
  if (!split.ok) return [...problems, ...split.problems.map((message) => ({ field: 'when', message }))]
  for (const { field } of split.when.timeTerms) if (!timeTypes.has(model.fields[field]?.type ?? '')) problems.push({ field: 'when', message: `${field} is not a timestamp or date field of ${spec.resource}` })
  // A ready record is checked against `when` in memory, where search and similarity need the database.
  if (/\b(search|similar)\s*\(/.test(spec.when)) problems.push({ field: 'when', message: 'cannot use search() or similar()' })
  const parsed = parseFilter(spec.when)
  const checked = parsed.ast && checkFilter(model, parsed.ast)
  if (checked && !checked.ok) problems.push(...checked.errors.map((error) => ({ field: 'when', message: error.message })))
  return problems
}
