import { layoutItems } from '@protobase/schema/internal'
import { createWhere, printFilter, type AppAddress, type LayoutItemModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { humanize } from '../live/naming'

const where = createWhere()

/** A resource whose records point at a record through one of its fields, as the record page's rail counts them. */
export type IncomingRelation = { resource: string; field: string; label: string }

/**
 * The relations that point at records of `model`, as the rail lists them by default: each filterable relation of
 * another resource the user can see (a hidden resource or field is not in the meta), to a record of one key column.
 * Left out are a resource's tenant, which every record holds, and what an `l.related` section of the page already
 * lists, the record's lines included. Two fields of one resource are told apart by their labels.
 */
export const incomingRelations = (model: ResourceModel, resources: Record<string, ResourceModel>, views: Record<string, ViewModel>, layout: LayoutItemModel[]): IncomingRelation[] => {
  if (model.primaryKey.length !== 1) return []
  const listed = new Set(layoutItems(layout).flatMap((item) => (item.kind === 'related' && !item.through && !item.from ? [`${item.resource}.${item.field}`] : [])))
  const found = Object.values(resources).flatMap((source) =>
    Object.values(source.fields)
      .filter((field) => field.type === 'relation' && field.relation?.resource === model.name && field.relation.columns.length === 1 && field.filterable)
      .filter((field) => field.name !== source.tenant && !listed.has(`${source.name}.${field.name}`))
      .map((field) => ({ source, field: field.name })),
  )
  return found.map(({ source, field }) => {
    const view = views[source.name]
    const plural = view?.names?.plural ?? humanize(source.name)
    const several = found.filter((other) => other.source.name === source.name).length > 1
    return { resource: source.name, field, label: several ? `${plural} (${view?.fields[field]?.label ?? humanize(field)})` : plural }
  })
}

/** The list of the records that point at `key` through `relation`, filtered as its list's address reads. */
export const incomingAddress = (relation: IncomingRelation, key: string): AppAddress => ({ kind: 'list', resource: relation.resource, filter: printFilter(where.eq(relation.field, key)) })
