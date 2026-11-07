import { checkFilter, parseFilter, type ResourceModel } from '@protobase/schema'
import { isCaptured } from '../../changes/capture-sql'
import { readyWhen, timeField } from './ready-when'

/** What a ready trigger declares: the resource, its `when` and the fields of its ready key. */
export type ReadySpec = { resource: string; when?: string; key?: string[] }

type Problem = { field?: string; message: string }

const timeTypes = new Set(['timestamp', 'date'])

// Whether the filter calls search() or similar(), which only the database can evaluate.
const usesSearch = (node: unknown): boolean => {
  if (typeof node !== 'object' || node === null) return false
  const kind = (node as { kind?: unknown }).kind
  if (kind === 'search' || kind === 'similar') return true
  return Object.values(node).some(usesSearch)
}

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
  for (const name of spec.key ?? []) {
    const field = model.fields[name]
    if (!field) problems.push({ field: 'key', message: `${spec.resource} has no field "${name}"` })
    // A sensitive value is never sent with the record, so the key would never see it change.
    else if (field.sensitive) problems.push({ field: 'key', message: `${name} is sensitive, so a record read never carries it` })
  }
  if (spec.when === undefined) return problems
  const split = readyWhen(spec.when)
  if (!split.ok) return [...problems, ...split.problems.map((message) => ({ field: 'when', message }))]
  for (const { field } of split.when.timeTerms) if (!timeTypes.has(timeField(model, field)?.type ?? '')) problems.push({ field: 'when', message: `${field} is not a timestamp or date field of ${spec.resource}` })
  const parsed = parseFilter(spec.when)
  // A ready record is checked against `when` in memory, where search and similarity need the database.
  if (usesSearch(parsed.ast)) problems.push({ field: 'when', message: 'cannot use search() or similar()' })
  const checked = parsed.ast && checkFilter(model, parsed.ast)
  if (checked && !checked.ok) problems.push(...checked.errors.map((error) => ({ field: 'when', message: error.message })))
  return problems
}
