import { createWhere, printFilter, type AppAddress, type LayoutItemModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { humanize } from '../live/naming'

const where = createWhere()

/** A resource whose records point at a record through one of its fields, as the record page's rail counts them. */
export type IncomingRelation = { resource: string; field: string; label: string }

/**
 * The relations that point at records of `model`, as the rail lists them by default: each filterable relation of
 * another resource the user can see (a hidden resource or field is not in the meta), to a record of one key column.
 * Left out are a resource's tenant, which every record holds, and what an `l.related` section or an `l.thread` of the
 * page already lists, the record's lines included. A custom component's fallback counts only when `registered` says the
 * app has no component of that name, since the page then draws the fallback in its place. Two fields of one resource are
 * told apart by their labels.
 */
export const incomingRelations = (
  model: ResourceModel,
  resources: Record<string, ResourceModel>,
  views: Record<string, ViewModel>,
  layout: LayoutItemModel[],
  registered: (component: string) => boolean,
): IncomingRelation[] => {
  if (model.primaryKey.length !== 1) return []
  const listed = new Set(drawnItems(layout, registered).flatMap((item) => ((item.kind === 'related' && !item.through && !item.from) || item.kind === 'thread' ? [`${item.resource}.${item.field}`] : [])))
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

// The layout's items the page draws, wherever they sit: a custom item's fallback only when its component is missing
const drawnItems = (layout: readonly LayoutItemModel[], registered: (component: string) => boolean): LayoutItemModel[] =>
  layout.flatMap((item) => {
    if (item.kind === 'group' || item.kind === 'tab') return drawnItems(item.items, registered)
    if (item.kind === 'custom' && !registered(item.component)) return [item, ...drawnItems(item.fallback ?? [], registered)]
    return [item]
  })

/** The list of the records that point at `key` through `relation`, filtered as its list's address reads. */
export const incomingAddress = (relation: IncomingRelation, key: string): AppAddress => ({ kind: 'list', resource: relation.resource, filter: printFilter(where.eq(relation.field, key)) })
