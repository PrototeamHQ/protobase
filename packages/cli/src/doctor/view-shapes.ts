import type { FilterWidgetModel, GalleryModel, RelatedModel, ResourceModel, SortSpec, ViewModel } from '@protobase/schema'
import type { ReadShape } from './read-shape'
import { all, any, anyOf, compare, configFilter, configSort, isTrue, sortText } from './shape-filters'

type Models = Record<string, ResourceModel>

const numberTypes = ['integer', 'bigint', 'decimal']

const request = (resource: string, filter: string | undefined, sort: SortSpec | undefined) => {
  const params = [...(filter ? [`filter=${filter}`] : []), ...(sort ? [`order_by=${sortText(sort)}`] : [])]
  return `GET /${resource}${params.length > 0 ? `?${params.join('&')}` : ''}`
}

/** The order a list opens in, as the app asks for it: the view's sort, or the primary key's. */
export const listSort = (model: ResourceModel, view: ViewModel | undefined): SortSpec => {
  const first = view?.list?.sort?.[0]
  return [first ?? [model.primaryKey[0]!, 'asc']]
}

// A widget filters the list with the values chosen, and a facets menu counts each value with the other filters applied;
// on a number field the app shows a facets widget as a range too.
const widgetShapes = (model: ResourceModel, widget: FilterWidgetModel, from: string): ReadShape[] => {
  const shape = (request: string, query: ReadShape['query']): ReadShape => ({ resource: model.name, request, from, query })
  const field = (name: string) => model.fields[name]
  if (widget.kind === 'flags') {
    const fields = widget.fields.flatMap((name) => (field(name) ? [field(name)!] : []))
    if (fields.length === 0) return []
    return [
      ...fields.map((flag) => shape(`GET /${model.name}:facets?field=${flag.name}`, { groupBy: flag.name })),
      shape(request(model.name, fields.map((flag) => `${flag.name} = true`).join(' OR '), undefined), { filter: any(fields.map(isTrue)) }),
    ]
  }
  const target = field(widget.field)
  if (!target) return []
  if (widget.kind === 'toggle') return [shape(request(model.name, `${target.name} = true`, undefined), { filter: isTrue(target) })]
  if (widget.kind === 'dateRange') return [shape(request(model.name, `${target.name} >= …`, undefined), { filter: compare(target, '>=') })]
  if (widget.kind === 'range' || numberTypes.includes(target.type)) {
    return [shape(request(model.name, `${target.name} >= … AND ${target.name} <= …`, undefined), { filter: all([compare(target, '>='), compare(target, '<=')]) })]
  }
  return [shape(`GET /${model.name}:facets?field=${target.name}`, { groupBy: target.name }), shape(request(model.name, `${target.name} in (…)`, undefined), { filter: anyOf(target) })]
}

// The section's records match this record's key, or with `through`, the keys the join records hand on.
const relatedShapes = (item: RelatedModel, owner: string, models: Models): ReadShape[] => {
  const target = models[item.resource]
  const match = target?.fields[item.field]
  if (!target || !match) return []
  const from = `related "${item.title}" on the ${owner} record page`
  const filter = configFilter(target, item.filter)
  const sort = configSort(target, item.sort)
  const extra = item.filter ? ` AND (${item.filter})` : ''
  const via = item.through && models[item.through.resource]
  const viaField = via && via.fields[item.through!.field]
  const join: ReadShape[] = via && viaField
    ? [{ resource: via.name, request: request(via.name, `${viaField.name} = …${item.through!.filter ? ` AND (${item.through!.filter})` : ''}`, undefined), from, query: { filter: all([compare(viaField), configFilter(via, item.through!.filter)]) } }]
    : []
  const matched = item.through ? anyOf(match) : compare(match)
  const text = item.through ? `${match.name} in (…)` : `${match.name} = …`
  return [...join, { resource: target.name, request: request(target.name, `${text}${extra}`, sort), from, query: { filter: all([matched, filter]), ...(sort && { sort }) } }]
}

// A gallery reads its photos for the one record on the page, in their order.
const galleryShapes = (item: GalleryModel, owner: string, models: Models): ReadShape[] => {
  const holder = item.photos && models[item.photos.resource]
  const field = holder?.fields[item.photos!.field]
  if (!holder || !field) return []
  const sort = configSort(holder, item.photos!.sort)
  return [{ resource: holder.name, request: request(holder.name, `${field.name} = …`, sort), from: `gallery "${item.title}" on the ${owner} record page`, query: { filter: compare(field), ...(sort && { sort }) } }]
}

const displayShapes = (model: ResourceModel, view: ViewModel, models: Models): ReadShape[] =>
  (view.list?.displays ?? []).flatMap((display): ReadShape[] => {
    if (display.kind === 'map') {
      const latitude = model.fields[display.latitude]
      const longitude = model.fields[display.longitude]
      if (!latitude || !longitude) return []
      const filter = all([compare(latitude, '>='), compare(latitude, '<='), compare(longitude, '>='), compare(longitude, '<=')])
      return [{ resource: model.name, request: `GET /${model.name}:map?filter=${latitude.name} >= … AND ${latitude.name} <= … AND ${longitude.name} >= … AND ${longitude.name} <= …`, from: `the map display "${display.name}"`, query: { filter } }]
    }
    const photos = display.kind === 'cards' ? display.photos : undefined
    const holder = photos && models[photos.resource]
    const field = holder?.fields[photos!.field]
    if (!holder || !field) return []
    const sort = configSort(holder, photos!.sort)
    return [{ resource: holder.name, request: request(holder.name, `${field.name} in (…)`, sort), from: `the photos of the ${model.name} cards`, query: { filter: anyOf(field), ...(sort && { sort }) } }]
  })

// Each saved search lists its records newest first and counts those after the user last looked.
const searchesShapes = (view: ViewModel, models: Models): ReadShape[] => {
  const unseen = view.searchesOf?.unseen
  const target = view.searchesOf && models[view.searchesOf.resource]
  const field = unseen && target?.fields[unseen.field]
  if (!target || !field) return []
  const sort: SortSpec = [[field.name, 'desc']]
  return [{ resource: target.name, request: request(target.name, `${field.name} > …`, sort), from: `the new records of each saved search of ${view.resource}`, query: { filter: compare(field, '>'), sort } }]
}

const recentShapes = (model: ResourceModel, view: ViewModel): ReadShape[] => {
  const recent = view.nav?.recent
  if (!recent) return []
  const filter = configFilter(model, recent.filter)
  const sort = configSort(model, recent.orderBy) ?? listSort(model, view)
  return [{ resource: model.name, request: request(model.name, recent.filter, sort), from: 'the recent records in the sidebar', query: { ...(filter && { filter }), sort } }]
}

/**
 * The reads a view's pages make: its list in its order, the filter widgets and their counts, its displays' maps and
 * photos, the records of its related sections and the photos of its galleries, the recent records in the sidebar and a saved search's new records.
 */
export const viewShapes = (view: ViewModel, models: Models): ReadShape[] => {
  const model = models[view.resource]
  if (!model) return []
  const sort = listSort(model, view)
  const list = view.roles ? `the ${model.name} list for ${view.roles.join(', ')}` : `the ${model.name} list`
  return [
    { resource: model.name, request: request(model.name, undefined, sort), from: `${list}'s order`, query: { sort } },
    ...view.filters.flatMap((widget) => widgetShapes(model, widget, `${list}'s ${widget.kind === 'dateRange' ? 'date range' : widget.kind} filter`)),
    ...displayShapes(model, view, models),
    ...view.layout.flatMap((item) => (item.kind === 'related' ? relatedShapes(item, model.name, models) : item.kind === 'gallery' ? galleryShapes(item, model.name, models) : [])),
    ...recentShapes(model, view),
    ...searchesShapes(view, models),
  ]
}
