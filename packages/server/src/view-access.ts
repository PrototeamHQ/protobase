import { resolveFieldPath } from '@protobase/layout'
import type { ActionModel, ActionRun, CardPhotosModel, ChartModel, CustomSectionModel, FilterWidgetModel, LayoutItemModel, ListDisplayModel, ListModel, MapSectionModel, NavModel, NavRecentModel, RelatedModel, ResourceModel, SearchResultModel, ViewModel } from '@protobase/schema'
import { addressErrors, hrefPlaceholders, navRecentErrors, pruneByShape, shapes as s, tableDisplay } from '@protobase/schema/internal'
import { cardPhotosErrors } from './view-card-photos'
import { relatedErrors } from './view-related'

type Of<U, K extends string> = Extract<U, { kind: K }>

// Columns narrow to what the caller can read; a section whose resources, fields, filter or sort they cannot use goes.
const pruneRelated = (item: RelatedModel, resource: string, models: Record<string, ResourceModel>): RelatedModel | undefined => {
  const { columns, ...rest } = item
  const visible = models[item.resource] ? columns?.filter((column) => resolveFieldPath(models, item.resource, column).ok) : undefined
  const narrowed = visible && visible.length > 0 ? { ...rest, columns: visible } : rest
  return relatedErrors(narrowed, resource, models).length === 0 ? narrowed : undefined
}

// The list opens in its table when the display it names as its default is left out.
const keepDefault = ({ default: opens, displays, ...list }: ListModel): ListModel => {
  const shown = displays && displays.length > 0 ? displays : undefined
  const kept = opens === tableDisplay || shown?.some((display) => display.name === opens)
  return { ...list, ...(shown && { displays: shown }), ...(opens !== undefined && kept && { default: opens }) }
}

// A card keeps its photos only when the caller can load them; without them it shows its own image alone.
const listShape = (resource: string, models: Record<string, ResourceModel>) =>
  s.object<ListModel>(
    {
      columns: s.list(s.field),
      sort: s.list(s.tuple(s.field, s.data)),
      search: s.list(s.field),
      displays: s.list(
        s.oneOf<ListDisplayModel>({
          cards: s.object<Of<ListDisplayModel, 'cards'>>({
            kind: s.data,
            name: s.data,
            label: s.data,
            icon: s.data,
            image: s.field,
            title: s.field,
            subtitle: s.field,
            amount: s.list(s.field),
            badge: s.field,
            meta: s.list(s.field),
            footer: s.list(s.field),
            flags: s.list(s.field),
            card: s.data,
            photos: s.map<CardPhotosModel>((photos) => (cardPhotosErrors(photos, resource, models).length === 0 ? photos : undefined)),
          }),
          map: s.object<Of<ListDisplayModel, 'map'>>(
            { kind: s.data, name: s.data, label: s.data, icon: s.data, latitude: s.field, longitude: s.field, cards: s.data },
            { requires: ['latitude', 'longitude'] },
          ),
          custom: s.object<Of<ListDisplayModel, 'custom'>>(
            { kind: s.data, name: s.data, label: s.data, icon: s.data, component: s.data, fields: s.list(s.field), props: s.refs },
            { requires: ['props'] },
          ),
        }),
      ),
      default: s.data,
    },
    { after: keepDefault },
  )

const widgetShape = s.oneOf<FilterWidgetModel>({
  range: s.object<Of<FilterWidgetModel, 'range'>>({ kind: s.data, field: s.field, histogram: s.data }, { requires: ['field'] }),
  facets: s.object<Of<FilterWidgetModel, 'facets'>>({ kind: s.data, field: s.field, search: s.data }, { requires: ['field'] }),
  dateRange: s.object<Of<FilterWidgetModel, 'dateRange'>>({ kind: s.data, field: s.field, presets: s.data }, { requires: ['field'] }),
  toggle: s.object<Of<FilterWidgetModel, 'toggle'>>({ kind: s.data, field: s.field }, { requires: ['field'] }),
  flags: s.object<Of<FilterWidgetModel, 'flags'>>({ kind: s.data, fields: s.list(s.field, { nonEmpty: true }), label: s.data }, { requires: ['fields'] }),
})

const layoutShape = (resource: string, models: Record<string, ResourceModel>) =>
  s.oneOf<LayoutItemModel>({
    section: s.object<Of<LayoutItemModel, 'section'>>({ kind: s.data, title: s.data, help: s.data, fields: s.list(s.field, { nonEmpty: true }) }, { requires: ['fields'] }),
    sidebar: s.object<Of<LayoutItemModel, 'sidebar'>>({ kind: s.data, fields: s.list(s.field, { nonEmpty: true }) }, { requires: ['fields'] }),
    related: s.map<RelatedModel>((item) => pruneRelated(item, resource, models)),
    custom: s.object<CustomSectionModel>({ kind: s.data, component: s.data, title: s.data, sidebar: s.data, props: s.refs }, { requires: ['props'] }),
    map: s.object<MapSectionModel>({ kind: s.data, title: s.data, latitude: s.field, longitude: s.field, zoom: s.data, sidebar: s.data }, { requires: ['latitude', 'longitude'] }),
  })

// A link goes when it reads a hidden field, or leads to a resource or field the caller cannot see.
const linkShape = (model: ResourceModel, models: Record<string, ResourceModel>) =>
  s.map<Of<ActionRun, 'link'>>((run) => {
    const followable = 'to' in run ? addressErrors(run.to, { models, source: model }).length === 0 : hrefPlaceholders(run.href).every((name) => Object.hasOwn(model.fields, name))
    return followable ? run : undefined
  })

const actionShape = (model: ResourceModel, models: Record<string, ResourceModel>) =>
  s.object<ActionModel>(
    {
      name: s.data,
      label: s.data,
      icon: s.data,
      confirm: s.data,
      bulk: s.data,
      run: s.oneOf<ActionRun>({
        update: s.object<Of<ActionRun, 'update'>>({ kind: s.data, values: s.keys({ all: true }) }, { requires: ['values'] }),
        delete: s.data,
        link: linkShape(model, models),
      }),
    },
    { requires: ['run'] },
  )

// Every part of a view, and what a field the caller cannot read does to it. The compiler wants a shape for each part,
// so a part added to ViewModel is named here before it reaches anyone.
const viewShape = (resource: string, model: ResourceModel, models: Record<string, ResourceModel>) =>
  s.object<ViewModel>({
    resource: s.data,
    roles: s.data,
    title: s.field,
    searchResult: s.object<SearchResultModel>({ title: s.list(s.field, { nonEmpty: true }), subtitle: s.field }),
    nav: s.object<NavModel>({ hidden: s.data, group: s.data, order: s.data, recent: s.map<NavRecentModel>((recent) => (navRecentErrors(recent, model).length === 0 ? recent : undefined)) }),
    names: s.data,
    icon: s.data,
    help: s.data,
    fields: s.keys(),
    list: listShape(resource, models),
    filters: s.list(widgetShape),
    layout: s.list(layoutShape(resource, models)),
    chart: s.object<ChartModel>({ field: s.field, range: s.data, granularity: s.data }, { requires: ['field'] }),
    saveFeedback: s.data,
    actions: s.list(actionShape(model, models)),
  })

/**
 * The view with every reference to a field the caller cannot read removed: list columns, sort, search and displays,
 * field hints, filter widgets, record sections, maps and custom components' props, the chart, title and search result, the
 * actions that set or read one, and the sidebar's `recent` group. Nothing in it may name a hidden field. Related sections
 * and links are checked against `models`, the caller's view of every resource.
 */
export const pruneView = (view: ViewModel, model: ResourceModel, models: Record<string, ResourceModel>): ViewModel => {
  const pruned = pruneByShape(view, viewShape(view.resource, model, models), (name) => Object.hasOwn(model.fields, name))
  if (!pruned) throw new Error(`The view of ${view.resource} is not an object`)
  return pruned
}
