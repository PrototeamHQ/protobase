import { resolveFieldPath } from '@protobase/layout'
import { checkFilter, checkOrderBy, parseFilter, parseOrderBy, type RelatedModel, type ResourceModel } from '@protobase/schema'

const filterErrors = (model: ResourceModel, source: string | undefined) => {
  if (source === undefined) return []
  const parsed = parseFilter(source)
  if (!parsed.ok) return parsed.errors.map((error) => error.message)
  const checked = parsed.ast ? checkFilter(model, parsed.ast) : undefined
  return checked && !checked.ok ? checked.errors.map((error) => error.message) : []
}

const sortErrors = (model: ResourceModel, source: string | undefined) => {
  if (source === undefined) return []
  const parsed = parseOrderBy(source)
  if (!parsed.ok) return parsed.errors.map((error) => error.message)
  const checked = checkOrderBy(model, parsed.items)
  return checked.ok ? [] : checked.errors.map((error) => error.message)
}

// The app filters on the field, so it must be filterable; `to` names the resource it must point at.
const matchErrors = (model: ResourceModel, name: string, to?: string) => {
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
    ...(item.through ? [...throughErrors(item.through, resource, models), ...matchErrors(target, item.field)] : matchErrors(target, item.field, resource)),
    ...filterErrors(target, item.filter).map((error) => `filter: ${error}`),
    ...sortErrors(target, item.sort).map((error) => `sort: ${error}`),
    ...(item.columns ?? []).flatMap((column) => {
      const resolved = resolveFieldPath(models, target.name, column)
      if (!resolved.ok) return [`column: ${resolved.message}`]
      return resolved.steps.at(-1)!.field.sensitive ? [`column: "${column}" is sensitive, so it cannot be listed`] : []
    }),
    ...(item.pageSize === undefined || (Number.isInteger(item.pageSize) && item.pageSize >= 1 && item.pageSize <= 100) ? [] : ['pageSize must be a whole number from 1 to 100']),
  ]
}
