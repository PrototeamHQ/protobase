import type { FieldModel, ResourceModel } from '@protobase/schema'
import type { Registry } from './registry'

type Find = (name: string) => ResourceModel | undefined

const sameValues = (a: readonly string[] = [], b: readonly string[] = []) => a.length === b.length && a.every((value, i) => value === b[i])

// The linked resource, and the problem of the relation that reaches it: one column, matched with a key of one field.
const linkedOf = (model: ResourceModel, field: FieldModel, find: Find): { linked?: ResourceModel; problem?: string } => {
  const { via, from } = field.lookup!
  if (from === undefined) {
    const name = model.fields[via]!.relation!.resource
    const linked = find(name)
    if (!linked) return { problem: `goes through "${via}" to "${name}", which the app does not have` }
    return linked.primaryKey.length === 1 ? { linked } : { problem: `goes through "${via}" to "${name}", whose key has ${linked.primaryKey.length} fields, not one` }
  }
  const linked = find(from)
  if (!linked) return { problem: `reads "${from}", which the app does not have` }
  const relation = Object.hasOwn(linked.fields, via) ? linked.fields[via]! : undefined
  if (relation?.relation?.resource !== model.name) return { problem: `reads "${from}" through "${via}", which is not a relation of ${from} to ${model.name}` }
  if (relation.relation.columns.length !== 1) return { problem: `reads "${from}" through "${via}", a relation of several columns (not implemented)` }
  return model.primaryKey.length === 1 ? { linked } : { problem: `reads "${from}", which needs ${model.name} to have a key of one field` }
}

// The value is the linked field's, so the lookup has its type, and is filtered and sorted as that field is.
const valueProblems = (field: FieldModel, linked: ResourceModel) => {
  const name = field.lookup!.field
  const value = Object.hasOwn(linked.fields, name) ? linked.fields[name]! : undefined
  if (!value) return [`shows "${name}", which is not a field of ${linked.name}`]
  return [
    ...(value.sensitive ? [`shows "${name}", which is sensitive`] : []),
    ...(value.type !== field.type ? [`is ${field.type}, but ${linked.name}.${name} is ${value.type}`] : []),
    ...(value.type === field.type && field.type === 'enum' && !sameValues(field.enumValues, value.enumValues) ? [`has other enum values than ${linked.name}.${name}`] : []),
    ...(field.filterable && !value.filterable ? [`is filterable, but ${linked.name}.${name} is not`] : []),
    ...(field.sortable && !value.sortable ? [`is sortable, but ${linked.name}.${name} is not`] : []),
  ]
}

/** What is wrong with the lookup fields of a resource, now that every resource is known. */
export const lookupProblems = (model: ResourceModel, find: Find) =>
  Object.values(model.lookups ?? {}).flatMap((field) => {
    const { linked, problem } = linkedOf(model, field, find)
    return (linked ? valueProblems(field, linked) : [problem!]).map((text) => `${model.name} lookup field "${field.name}" ${text}`)
  })

/** Stops startup on a lookup field whose linked record cannot be found, or whose linked field does not fit it. */
export const checkLookups = (registry: Registry) => {
  const find = (name: string) => registry.find(name)?.model
  const problems = registry.entries.flatMap(({ model }) => lookupProblems(model, find))
  if (problems.length > 0) throw new Error(`The lookup fields cannot read their linked records:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}
