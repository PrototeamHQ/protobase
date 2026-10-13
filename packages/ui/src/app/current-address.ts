import type { AppAddress, FilterLayout, MapView, ResourceModel, ViewModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { defaultDisplay } from './displays/list-displays'
import { defaultOrderBy } from './list-order'

/** A list as the app shows it: every value there, the view's default where the address names none; `map` has none. */
export type ListAddress = { kind: 'list'; resource: string; display: string; filter: string; orderBy: string; filterLayout: FilterLayout; map?: MapView }

/** The address the app shows, as logical values. A record's key is in the text form the record API takes. */
export type CurrentAddress =
  | ListAddress
  | { kind: 'record'; resource: string; key: string }
  | { kind: 'create'; resource: string; values?: Readonly<Record<string, string>> }
  | { kind: 'page'; page: string }

/** What can change about the list the app shows; `undefined` returns a value to its default. */
export type ListChange = Partial<Omit<ListAddress, 'kind' | 'resource'>>

export type ListDefaults = Pick<ListAddress, 'display' | 'orderBy' | 'filterLayout'>

/** What a list shows when its address names nothing: its default display for the screen, the list's sort, the filters in a bar. */
export const listDefaults = (model: ResourceModel | undefined, view: ViewModel | undefined, xs = false): ListDefaults => ({
  display: defaultDisplay(view, xs),
  orderBy: model ? defaultOrderBy(model, view) : '',
  filterLayout: 'bar',
})

/** The address as read from the location, with a list's defaults filled in and a record's key as text. */
export const currentAddress = (read: AppAddress | undefined, defaults: (resource: string) => ListDefaults): CurrentAddress | undefined => {
  if (read?.kind === 'record') return { kind: 'record', resource: read.resource, key: encodeKey(read.key) }
  if (read?.kind !== 'list') return read
  return { ...defaults(read.resource), filter: '', ...read }
}

/** The list address after `change`, leaving out every value that is empty or its default, so `/<resource>` stays clean. */
export const changedList = (read: Extract<AppAddress, { kind: 'list' }>, change: ListChange, defaults: ListDefaults): AppAddress => {
  const next = { ...read, ...change }
  const differs = (name: keyof ListDefaults) => next[name] !== undefined && next[name] !== defaults[name]
  return {
    kind: 'list',
    resource: read.resource,
    ...(next.filter && { filter: next.filter }),
    ...(differs('display') && { display: next.display }),
    ...(differs('orderBy') && { orderBy: next.orderBy }),
    ...(differs('filterLayout') && { filterLayout: next.filterLayout }),
    ...(next.map && { map: next.map }),
  }
}
