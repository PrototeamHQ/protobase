import { encodeKey, tableDisplay, type AppAddress, type FilterLayout, type ResourceModel, type ViewModel } from '@protobase/schema'
import { defaultOrderBy } from './list-order'

/** A list as the app shows it: every value there, the view's default where the address names none. */
export type ListAddress = { kind: 'list'; resource: string; display: string; filter: string; orderBy: string; filterLayout: FilterLayout }

/** The address the app shows, as logical values. A record's key is in the text form the record API takes. */
export type CurrentAddress = ListAddress | { kind: 'record'; resource: string; key: string } | { kind: 'create'; resource: string } | { kind: 'page'; page: string }

/** What can change about the list the app shows; `undefined` returns a value to its default. */
export type ListChange = Partial<Omit<ListAddress, 'kind' | 'resource'>>

export type ListDefaults = Pick<ListAddress, 'display' | 'orderBy' | 'filterLayout'>

/** What a list shows when its address names nothing: the view's default display, the list's sort, the filters in a bar. */
export const listDefaults = (model: ResourceModel | undefined, view: ViewModel | undefined): ListDefaults => ({
  display: view?.list?.default ?? tableDisplay,
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
  }
}
