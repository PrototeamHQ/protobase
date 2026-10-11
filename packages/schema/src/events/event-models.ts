import { fieldsUsedBy } from '../access/resolve'
import { checkFilter, parseFilter } from '../filter'
import type { CheckedFilter, EventModel, ResourceModel } from '../model'
import type { EventMatch, EventSpec } from './event-helpers'

const namePattern = /^[a-z][a-zA-Z0-9]*$/

// Event filters are evaluated against captured records, which hold every field but the sensitive ones.
const trusted = (model: ResourceModel): ResourceModel => ({
  ...model,
  fields: Object.fromEntries(Object.entries(model.fields).map(([name, field]) => [name, { ...field, filterable: true }])),
})

const needsDatabase = (filter: CheckedFilter): boolean => {
  if (filter.kind === 'and' || filter.kind === 'or') return filter.args.some(needsDatabase)
  if (filter.kind === 'not') return needsDatabase(filter.arg)
  return filter.kind === 'search' || filter.kind === 'similar'
}

/** The filter checked against the resource, or what is wrong with it. */
export const checkEventFilter = (model: ResourceModel, source: string): { filter?: CheckedFilter; problem?: string } => {
  const parsed = parseFilter(source)
  if (!parsed.ok) return { problem: parsed.errors[0]!.message }
  if (!parsed.ast) return { problem: 'is empty' }
  const checked = checkFilter(trusted(model), parsed.ast)
  if (!checked.ok) return { problem: checked.errors[0]!.message }
  const sensitive = fieldsUsedBy(checked.filter).filter((name) => model.fields[name]?.sensitive)
  if (sensitive.length > 0) return { problem: `uses sensitive field "${sensitive[0]}", which events never hold; use \`changed\` instead` }
  if (needsDatabase(checked.filter)) return { problem: 'uses search() or similar(), which need the database' }
  return { filter: checked.filter }
}

const specProblems = (model: ResourceModel, spec: EventSpec) => [
  ...(namePattern.test(spec.name) ? [] : ['is not a camelCase name']),
  ...(spec.operations.includes('undelete') && !model.softDelete ? ['needs a soft delete field (`.softDelete()`)'] : []),
  ...(['when', 'from', 'becomes'] as const).flatMap((option) => {
    const source = spec[option]
    if (source === undefined) return []
    const { problem } = checkEventFilter(model, source)
    return problem ? [`${option} ${problem}`] : []
  }),
  ...(spec.changed?.length === 0 ? ['changed lists no fields'] : []),
].map((problem) => `event "${spec.name}" ${problem}`)

const eventModel = (resource: string, { name, operations, when, from, becomes, changed, match }: EventSpec): EventModel => ({
  name: `${resource}.${name}`,
  operations: [...operations],
  ...(when !== undefined && { when }),
  ...(from !== undefined && { from }),
  ...(becomes !== undefined && { becomes }),
  ...(changed && { changed: [...changed] }),
  ...(match && { match: true as const }),
})

/** The specs that apply to the resource: `e.crud()`'s undeleted only when it soft deletes. */
export const activeSpecs = (model: ResourceModel, specs: readonly EventSpec[]) => specs.filter((spec) => !spec.softDeleteOnly || model.softDelete)

/** The resource's event catalogue, and what is wrong with its declarations. */
export const buildEventModels = (model: ResourceModel, specs: readonly EventSpec[]) => {
  const active = activeSpecs(model, specs)
  const names = active.map((spec) => spec.name)
  const twice = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))]
  return {
    events: active.map((spec) => eventModel(model.name, spec)),
    problems: [...twice.map((name) => `event "${name}" is declared twice`), ...active.flatMap((spec) => specProblems(model, spec))],
  }
}

/** The code predicates of the resource's events, by full event name. */
export const eventMatches = (model: ResourceModel, specs: readonly EventSpec[]) =>
  Object.fromEntries(activeSpecs(model, specs).flatMap((spec) => (spec.match ? [[`${model.name}.${spec.name}`, spec.match]] : []))) as Record<string, EventMatch<any>>
