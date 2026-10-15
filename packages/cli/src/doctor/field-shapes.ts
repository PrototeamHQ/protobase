import type { FieldModel, ResourceModel } from '@protobase/schema'
import type { ReadShape } from './read-shape'
import { anyOf, compare, holds, searchFor } from './shape-filters'

// A filterable field may be filtered alone, by `=` on its own; a JSON field by a key's value.
const filterOn = (field: FieldModel) => (field.type === 'json' ? holds(field) : compare(field))

/**
 * What the API takes of a resource from any caller, whatever the views show: a filter on each `.filterable()` field, a
 * sort by each `.sortable()` one, `search("...")` over its search fields, and the rows of a role limited to its own
 * records, which `.owner()` names.
 */
export const fieldShapes = (model: ResourceModel): ReadShape[] => {
  const fields = Object.values(model.fields)
  const at = `GET /${model.name}`
  return [
    ...fields.filter((field) => field.sortable).map((field): ReadShape => ({ resource: model.name, request: `${at}?order_by=${field.name} asc`, from: `"${field.name}" is sortable`, query: { sort: [[field.name, 'asc']] } })),
    ...fields.filter((field) => field.filterable).map((field): ReadShape => ({ resource: model.name, request: `${at}?filter=${field.name} = …`, from: `"${field.name}" is filterable`, query: { filter: filterOn(field) } })),
    ...(model.search?.length ? [{ resource: model.name, request: `${at}?filter=search("…")`, from: `the search over ${model.search.join(', ')}`, query: { filter: searchFor } }] : []),
    ...ownerShapes(model),
  ]
}

const ownerShapes = (model: ResourceModel): ReadShape[] => {
  const owner = model.owner === undefined ? undefined : model.fields[model.owner]
  if (!owner) return []
  return [{ resource: model.name, request: `GET /${model.name} by a role with own capabilities`, from: `"${owner.name}" is the owner`, query: {}, scope: { rowFilter: compare(owner) } }]
}

/** The names of the records a relation points at, which the app reads by their keys. */
export const lookupShapes = (model: ResourceModel, models: Record<string, ResourceModel>): ReadShape[] =>
  Object.values(model.fields).flatMap((field): ReadShape[] => {
    const target = field.relation ? models[field.relation.resource] : undefined
    const key = target?.primaryKey.length === 1 ? target.fields[target.primaryKey[0]!] : undefined
    if (!target || !key) return []
    return [{ resource: target.name, request: `GET /${target.name}?filter=${key.name} in (…)`, from: `the names ${model.name}.${field.name} shows`, query: { filter: anyOf(key) } }]
  })
