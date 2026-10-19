import { resolveFieldPath } from '@protobase/layout'
import { checkFilter, checkOrderBy, parseFilter, parseOrderBy, type RelatedModel, type ResourceModel } from '@protobase/schema'

const filterErrors = (model: ResourceModel, source: string | undefined) => {
  if (source === undefined) return []
  const parsed = parseFilter(source)
  if (!parsed.ok) return parsed.errors.map((error) => error.message)
  const checked = parsed.ast ? checkFilter(model, parsed.ast) : undefined
  return checked && !checked.ok ? checked.errors.map((error) => error.message) : []
}

export const sortErrors = (model: ResourceModel, source: string | undefined) => {
  if (source === undefined) return []
  const parsed = parseOrderBy(source)
  if (!parsed.ok) return parsed.errors.map((error) => error.message)
  const checked = checkOrderBy(model, parsed.items)
  return checked.ok ? [] : checked.errors.map((error) => error.message)
}

// The app filters on the field, so it must be filterable; `to` names the resource it must point at.
export const matchErrors = (model: ResourceModel, name: string, to?: string) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  if (!field) return [`unknown field "${name}" on ${model.name}`]
  if (!field.filterable) return [`"${name}" on ${model.name} is not filterable`]
  if (to !== undefined && field.relation?.resource !== to) return [`"${name}" on ${model.name} is not a relation to ${to}`]
  return []
}

/** The field whose values the `through` records hand on: `key`, else their single-column primary key. */
export const throughKey = (via: ResourceModel, key: string | undefined) => key ?? (via.primaryKey.length === 1 ? via.primaryKey[0] : undefined)

const throughErrors = (through: NonNullable<RelatedModel['through']>, resource: string, models: Record<string, ResourceModel>) => {
  const via = models[through.resource]
  if (!via) return [`unknown resource "${through.resource}"`]
  const key = throughKey(via, through.key)
  return [
    ...matchErrors(via, through.field, resource),
    ...(key === undefined ? [`${via.name} has a composite key, so name the field to collect with "key"`] : Object.hasOwn(via.fields, key) ? [] : [`unknown field "${key}" on ${via.name}`]),
    ...filterErrors(via, through.filter).map((error) => `filter: ${error}`),
  ].map((error) => `through: ${error}`)
}

/** What is wrong with the relation a related section's rows open; empty without one. */
export const openErrors = (item: RelatedModel, models: Record<string, ResourceModel>): string[] => {
  const target = models[item.resource]
  if (item.open === undefined || !target) return []
  const field = Object.hasOwn(target.fields, item.open) ? target.fields[item.open]! : undefined
  if (!field) return [`open: unknown field "${item.open}" on ${target.name}`]
  if (field.type !== 'relation' || !field.relation) return [`open: "${item.open}" on ${target.name} is not a relation`]
  if (item.open === item.field) return [`open: "${item.open}" is the field that matches this record`]
  const far = models[field.relation.resource]
  if (!far) return [`open: unknown resource "${field.relation.resource}"`]
  return far.primaryKey.length === 1 ? [] : [`open: ${far.name} has a composite key, so its records cannot be opened from "${item.open}"`]
}

/** What is wrong with matching `field` of the listed records against the `from` field of the owner's record. */
const fromErrors = (item: RelatedModel, from: string, owner: ResourceModel, target: ResourceModel) => {
  if (item.through) return ['from and through cannot be combined']
  const source = Object.hasOwn(owner.fields, from) ? owner.fields[from]! : undefined
  if (!source) return [`from: unknown field "${from}" on ${owner.name}`]
  if (source.sensitive) return [`from: "${from}" on ${owner.name} is sensitive`]
  const match = Object.hasOwn(target.fields, item.field) ? target.fields[item.field]! : undefined
  if (!match) return []
  const sameKind = source.type === match.type && source.relation?.resource === match.relation?.resource
  return sameKind ? [] : [`from: "${from}" on ${owner.name} and "${item.field}" on ${target.name} do not hold the same kind of value`]
}

/**
 * What is wrong with a related section on the record page of `resource`, against these models; empty when it can be
 * shown. Against the full models it checks the config; against a caller's models, whether that caller can use it.
 */
export const relatedErrors = (item: RelatedModel, resource: string, models: Record<string, ResourceModel>): string[] => {
  const owner = models[resource]
  const target = models[item.resource]
  if (!owner || !target) return [`unknown resource "${owner ? item.resource : resource}"`]
  if (owner.primaryKey.length !== 1) return [`${resource} has a composite key, so a related section cannot match it`]
  return [
    ...(item.from !== undefined
      ? [...matchErrors(target, item.field), ...fromErrors(item, item.from, owner, target)]
      : item.through
        ? [...throughErrors(item.through, resource, models), ...matchErrors(target, item.field)]
        : matchErrors(target, item.field, resource)),
    ...filterErrors(target, item.filter).map((error) => `filter: ${error}`),
    ...sortErrors(target, item.sort).map((error) => `sort: ${error}`),
    ...(item.columns ?? []).flatMap((column) => {
      const resolved = resolveFieldPath(models, target.name, column)
      if (!resolved.ok) return [`column: ${resolved.message}`]
      return resolved.steps.at(-1)!.field.sensitive ? [`column: "${column}" is sensitive, so it cannot be listed`] : []
    }),
    ...(item.limit === undefined || (Number.isInteger(item.limit) && item.limit >= 1 && item.limit <= 100) ? [] : ['limit must be a whole number from 1 to 100']),
    ...openErrors(item, models),
  ]
}
