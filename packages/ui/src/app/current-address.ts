import type { AppAddress, CalendarView, FilterLayout, MapView, ResourceModel, TimelineView, ViewModel } from '@protobase/schema'
import { encodeKey, viewOfList } from '@protobase/schema/internal'
import { defaultDisplay, listDefaultDisplay } from './displays/list-displays'
import { defaultOrderBy } from './list-order'

/**
 * A list as the app shows it: every value there, the view's default where the address names none; `map`, `calendar`,
 * `timeline` and `savedSearch`, the saved search it was opened from, have none.
 */
export type ListAddress = { kind: 'list'; resource: string; list?: string; display: string; filter: string; orderBy: string; filterLayout: FilterLayout; map?: MapView; calendar?: CalendarView; timeline?: TimelineView; savedSearch?: string }

/** The address the app shows, as logical values. A record's key is in the text form the record API takes. */
export type CurrentAddress =
  | ListAddress
  | { kind: 'record'; resource: string; key: string; edit?: true; open?: readonly string[]; tab?: string }
  | { kind: 'create'; resource: string; values?: Readonly<Record<string, string>> }
  | { kind: 'page'; page: string; tab?: string }

/** What can change about the list the app shows; `undefined` returns a value to its default. */
export type ListChange = Partial<Omit<ListAddress, 'kind' | 'resource' | 'list'>>

export type ListDefaults = Pick<ListAddress, 'display' | 'orderBy' | 'filterLayout' | 'filter'>

/**
 * The resource whose records a list shows, with its view: the list's own, or, when its view has `listOf`, the resource
 * that relation points at, if the caller can see it.
 */
export const listedResource = (resources: Record<string, ResourceModel>, views: Record<string, ViewModel>, resource: string, list?: string) => {
  const model = resources[resource]
  const own = viewOfList(views[resource], list)
  const listOf = own?.listOf
  const target = listOf === undefined ? undefined : model?.fields[listOf]?.relation?.resource
  return target !== undefined && resources[target] ? { model: resources[target], view: views[target], listOf: true } : { model, view: own, listOf: false }
}

/** What a list shows when its address names nothing: its default display for the screen, the list's sort, the filters in a bar. */
export const listDefaults = (model: ResourceModel | undefined, view: ViewModel | undefined, xs = false): ListDefaults => ({
  display: model ? listDefaultDisplay(model, view, xs) : defaultDisplay(view, xs),
  orderBy: model ? defaultOrderBy(model, view) : '',
  filterLayout: 'bar',
  filter: view?.list?.filter ?? '',
})

/** The address as read from the location, with a list's defaults filled in and a record's key as text. */
export const currentAddress = (read: AppAddress | undefined, defaults: (resource: string, list?: string) => ListDefaults): CurrentAddress | undefined => {
  if (read?.kind === 'record') return { kind: 'record', resource: read.resource, key: encodeKey(read.key), ...(read.edit && { edit: true as const }), ...(read.open && { open: read.open }), ...(read.tab && { tab: read.tab }) }
  if (read?.kind !== 'list') return read
  return { ...defaults(read.resource, read.list), ...read }
}

/** The list address after `change`, leaving out every value that is empty or its default (a cleared filter is written as an empty `filter=` when the default is not empty), so `/<resource>` stays clean. */
export const changedList = (read: Extract<AppAddress, { kind: 'list' }>, change: ListChange, defaults: ListDefaults): AppAddress => {
  const next = { ...read, ...change }
  const differs = (name: keyof ListDefaults) => next[name] !== undefined && next[name] !== defaults[name]
  return {
    kind: 'list',
    resource: read.resource,
    ...(read.list && { list: read.list }),
    ...(differs('filter') && { filter: next.filter }),
    ...(differs('display') && { display: next.display }),
    ...(differs('orderBy') && { orderBy: next.orderBy }),
    ...(differs('filterLayout') && { filterLayout: next.filterLayout }),
    ...(next.map && { map: next.map }),
    ...(next.calendar && { calendar: next.calendar }),
    ...(next.timeline && { timeline: next.timeline }),
    ...(next.savedSearch && { savedSearch: next.savedSearch }),
  }
}
