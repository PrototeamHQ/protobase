import { conditionReadable, resolveFieldPath } from '@protobase/layout'
import { isRecordCondition } from '@protobase/schema'
import type { ActionInputModel, ActionModel, ActionRun, CardFavoriteModel, CardPhotosModel, ChartModel, CommentsSectionModel, CustomSectionModel, FilterWidgetModel, FormModel, GalleryModel, HistorySectionModel, LayoutItemModel, ListDisplayModel, ListModel, MapSectionModel, NavModel, NavRecentModel, RelatedColumnModel, RelatedModel, ResourceModel, SaveSearchModel, SearchesOfModel, SearchResultModel, ViewModel } from '@protobase/schema'
import { addressErrors, chartFields, hrefPlaceholders, promptFields, navRecentErrors, pruneByShape, shapes as s, tableDisplay } from '@protobase/schema/internal'
import { cardFavoriteErrors } from './view-card-favorite'
import { cardPhotosErrors } from './view-card-photos'
import { openErrors, relatedErrors } from './view-related'
import { relatedColumnErrors } from './view-related-column'
import { searchesOfFor } from './view-saved-search'

type Of<U, K extends string> = Extract<U, { kind: K }>

// Columns narrow to what the caller can read; a section whose resources, fields, filter or sort they cannot use goes.
// An `open` the caller cannot use goes; the rows then open their own records.
const pruneRelated = (item: RelatedModel, resource: string, models: Record<string, ResourceModel>): RelatedModel | undefined => {
  if (isRecordCondition(item.when) && !conditionReadable(item.when, resource, models)) return undefined
  const { columns, open, ...rest } = item
  const visible = models[item.resource] ? columns?.filter((column) => resolveFieldPath(models, item.resource, column).ok) : undefined
  const narrowed: RelatedModel = visible && visible.length > 0 ? { ...rest, columns: visible } : rest
  const opened = open !== undefined && openErrors({ ...narrowed, open }, models).length === 0 ? { ...narrowed, open } : narrowed
  return relatedErrors(opened, resource, models).length === 0 ? opened : undefined
}

// A section, related table or sidebar whose record condition names what the caller cannot see goes, with its item.
const recordWhenShape = (resource: string, models: Record<string, ResourceModel>) =>
  s.map<string>((when) => (isRecordCondition(when) && !conditionReadable(when, resource, models) ? undefined : when))

// A gallery keeps the record's image when the caller can read it, and the photos when they can load them, as a card does;
// a gallery left with neither goes.
const pruneGallery = (item: GalleryModel, resource: string, model: ResourceModel, models: Record<string, ResourceModel>): GalleryModel | undefined => {
  const image = item.image !== undefined && Object.hasOwn(model.fields, item.image) ? item.image : undefined
  const photos = item.photos && cardPhotosErrors(item.photos, resource, models).length === 0 ? item.photos : undefined
  if (image === undefined && photos === undefined) return undefined
  return { kind: 'gallery', title: item.title, ...(image !== undefined && { image }), ...(photos && { photos }), ...(item.when !== undefined && { when: item.when }) }
}

// A card's dots keep the related columns the caller can use.
const withKeptDots = (display: ListDisplayModel, related: RelatedColumnModel[] = []): ListDisplayModel => {
  if (display.kind !== 'cards' || display.dots === undefined) return display
  const { dots, ...card } = display
  const kept = dots.filter((name) => related.some((column) => column.name === name))
  return kept.length > 0 ? { ...card, dots: kept } : card
}

// The list opens in its table when the display it names as its default is left out. Its columns keep the fields the
// caller can read and the related columns they can use, and its editable columns the fields the caller may write.
const tidyList = (model: ResourceModel) => ({ default: opens, displays, columns, relatedColumns, editable, ...list }: ListModel): ListModel => {
  const related = relatedColumns && relatedColumns.length > 0 ? relatedColumns : undefined
  const shown = displays && displays.length > 0 ? displays.map((display) => withKeptDots(display, related)) : undefined
  const kept = opens === tableDisplay || shown?.some((display) => display.name === opens)
  const visible = columns.filter((name) => Object.hasOwn(model.fields, name) || related?.some((column) => column.name === name))
  const writable = editable?.filter((name) => visible.includes(name) && !model.fields[name]!.readOnly)
  return {
    ...list,
    columns: visible,
    ...(related && { relatedColumns: related }),
    ...(writable && writable.length > 0 && { editable: writable }),
    ...(shown && { displays: shown }),
    ...(opens !== undefined && kept && { default: opens }),
  }
}

// A card keeps its photos only when the caller can load them; without them it shows its own image alone. It keeps its
// favorite button when the caller can save with it, or is a visitor the button's resource asks to sign in.
const listShape = (resource: string, model: ResourceModel, models: Record<string, ResourceModel>, prompted: ReadonlySet<string>) =>
  s.object<ListModel>(
    {
      // Names a related column too, so `tidyList` narrows it
      columns: s.data,
      relatedColumns: s.list(s.map<RelatedColumnModel>((column) => (relatedColumnErrors(column, resource, models).length === 0 ? column : undefined))),
      sort: s.list(s.tuple(s.field, s.data)),
      search: s.list(s.field),
      editable: s.list(s.field),
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
            // Names related columns, which `tidyList` narrows
            dots: s.data,
            card: s.data,
            photos: s.map<CardPhotosModel>((photos) => (cardPhotosErrors(photos, resource, models).length === 0 ? photos : undefined)),
            favorite: s.map<CardFavoriteModel>((favorite) => (prompted.has(favorite.resource) || cardFavoriteErrors(favorite, resource, models).length === 0 ? favorite : undefined)),
          }),
          map: s.object<Of<ListDisplayModel, 'map'>>(
            {
              kind: s.data,
              name: s.data,
              label: s.data,
              icon: s.data,
              latitude: s.field,
              longitude: s.field,
              cards: s.data,
              approximate: s.field,
              exact: s.field,
              radius: s.field,
              defaultRadius: s.data,
              area: s.field,
            },
            { requires: ['latitude', 'longitude'] },
          ),
          board: s.object<Of<ListDisplayModel, 'board'>>(
            { kind: s.data, name: s.data, label: s.data, icon: s.data, by: s.field, title: s.field, subtitle: s.field, badge: s.field, meta: s.list(s.field) },
            { requires: ['by'] },
          ),
          calendar: s.object<Of<ListDisplayModel, 'calendar'>>({ kind: s.data, name: s.data, label: s.data, icon: s.data, start: s.field, end: s.field, title: s.field }, { requires: ['start'] }),
          custom: s.object<Of<ListDisplayModel, 'custom'>>(
            { kind: s.data, name: s.data, label: s.data, icon: s.data, component: s.data, fields: s.list(s.field), props: s.refs },
            { requires: ['props'] },
          ),
        }),
      ),
      default: s.data,
    },
    { after: tidyList(model) },
  )

const widgetShape = s.oneOf<FilterWidgetModel>({
  range: s.object<Of<FilterWidgetModel, 'range'>>({ kind: s.data, field: s.field, histogram: s.data }, { requires: ['field'] }),
  facets: s.object<Of<FilterWidgetModel, 'facets'>>({ kind: s.data, field: s.field, search: s.data }, { requires: ['field'] }),
  dateRange: s.object<Of<FilterWidgetModel, 'dateRange'>>({ kind: s.data, field: s.field, presets: s.data }, { requires: ['field'] }),
  toggle: s.object<Of<FilterWidgetModel, 'toggle'>>({ kind: s.data, field: s.field }, { requires: ['field'] }),
  flags: s.object<Of<FilterWidgetModel, 'flags'>>({ kind: s.data, fields: s.list(s.field, { nonEmpty: true }), label: s.data }, { requires: ['fields'] }),
})

const layoutShape = (resource: string, model: ResourceModel, models: Record<string, ResourceModel>) =>
  s.oneOf<LayoutItemModel>({
    section: s.object<Of<LayoutItemModel, 'section'>>({ kind: s.data, title: s.data, help: s.data, helpWhen: s.data, presentation: s.data, when: recordWhenShape(resource, models), fields: s.list(s.field, { nonEmpty: true }) }, { requires: ['fields', 'when'] }),
    sidebar: s.object<Of<LayoutItemModel, 'sidebar'>>({ kind: s.data, fields: s.list(s.field, { nonEmpty: true }), when: recordWhenShape(resource, models) }, { requires: ['fields', 'when'] }),
    related: s.map<RelatedModel>((item) => pruneRelated(item, resource, models)),
    custom: s.object<CustomSectionModel>({ kind: s.data, component: s.data, title: s.data, sidebar: s.data, when: s.data, props: s.refs }, { requires: ['props'] }),
    map: s.object<MapSectionModel>({ kind: s.data, title: s.data, latitude: s.field, longitude: s.field, zoom: s.data, sidebar: s.data, when: s.data }, { requires: ['latitude', 'longitude'] }),
    gallery: s.map<GalleryModel>((item) => pruneGallery(item, resource, model, models)),
    history: s.object<HistorySectionModel>({ kind: s.data, title: s.data, limit: s.data, when: s.data }),
    comments: s.object<CommentsSectionModel>({ kind: s.data, title: s.data, when: s.data }),
  })

// A link goes when it reads a hidden field, or leads to a resource or field the caller cannot see.
const linkShape = (model: ResourceModel, models: Record<string, ResourceModel>) =>
  s.map<Of<ActionRun, 'link'>>((run) => {
    const followable = 'to' in run ? addressErrors(run.to, { models, source: model }).length === 0 : hrefPlaceholders(run.href).every((name) => Object.hasOwn(model.fields, name))
    return followable ? run : undefined
  })

// An AI action goes when the caller cannot read the field it writes or one its prompt reads. The prompt stays on the
// server, which runs the action; the app only needs to know which field it writes.
const aiShape = (model: ResourceModel) =>
  s.map<Of<ActionRun, 'ai'>>((run) => {
    const readable = [run.writes, ...promptFields(run.prompt ?? '')].every((name) => Object.hasOwn(model.fields, name))
    return readable ? { kind: 'ai', writes: run.writes } : undefined
  })

// Inputs name no field of the record; an action whose choice picks records of a resource the caller cannot read goes.
const inputsShape = (models: Record<string, ResourceModel>) =>
  s.map<ActionInputModel[]>((inputs) => (inputs.every((input) => input.resource === undefined || Object.hasOwn(models, input.resource)) ? inputs : undefined))

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
        ai: aiShape(model),
      }),
      inputs: inputsShape(models),
    },
    { requires: ['run', 'inputs'] },
  )

// Every part of a view, and what a field the caller cannot read does to it. The compiler wants a shape for each part,
// so a part added to ViewModel is named here before it reaches anyone.
const viewShape = (resource: string, model: ResourceModel, models: Record<string, ResourceModel>, prompted: ReadonlySet<string>) =>
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
    list: listShape(resource, model, models, prompted),
    filters: s.list(widgetShape),
    layout: s.list(layoutShape(resource, model, models)),
    // A chart goes when the caller cannot read a field it groups, counts over or adds up
    chart: s.map<ChartModel>((chart) => (chartFields(chart).every((name) => Object.hasOwn(model.fields, name)) ? chart : undefined)),
    recordMode: s.data,
    helpWhen: s.data,
    saveFeedback: s.data,
    actions: s.list(actionShape(model, models)),
    listOf: s.field,
    signIn: s.data,
    // The button stays for a caller who can see the searches' resource, or a visitor it asks to sign in
    saveSearch: s.map<SaveSearchModel>((search) => (prompted.has(search.resource) || models[search.resource] ? search : undefined)),
    searchesOf: s.map<SearchesOfModel>((searches) => searchesOfFor(searches, resource, models)),
    import: s.data,
    export: s.data,
    create: s.data,
    // Public forms have a route of their own, which serves each to anyone; `/meta` never carries them
    forms: s.map<FormModel[]>(() => undefined),
  })

/**
 * The view with every reference to a field the caller cannot read removed: list columns, sort, search and displays,
 * field hints, filter widgets, record sections, maps, galleries and custom components' props, the chart, title and search result, the
 * actions that set or read one, and the sidebar's `recent` group. Nothing in it may name a hidden field. Related sections, related list columns
 * and links are checked against `models`, the caller's view of every resource, and so are `searchesOf`, cards' favorite
 * buttons and the "Save search" button; the buttons stay for a visitor when their resource is one of `prompted`, those
 * that ask the visitor to sign in.
 */
export const pruneView = (view: ViewModel, model: ResourceModel, models: Record<string, ResourceModel>, prompted: ReadonlySet<string> = new Set()): ViewModel => {
  const pruned = pruneByShape(view, viewShape(view.resource, model, models, prompted), (name) => Object.hasOwn(model.fields, name))
  if (!pruned) throw new Error(`The view of ${view.resource} is not an object`)
  return pruned
}
