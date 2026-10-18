import type { ViewModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { RequestAccess } from '../request-access'
import type { Row } from '../types'

/** The title field of the resource's view, when the caller may read it. */
export const readableTitle = (access: RequestAccess, views: readonly ViewModel[]) => {
  const title = views.find((view) => view.resource === access.entry.name)?.title
  return title !== undefined && Object.hasOwn(access.model.fields, title) ? title : undefined
}

/**
 * The record as a mention email names it: the view's singular name with the record's title when it has one the author
 * may read, else with its key, such as `Ticket: Printer on fire` or `Ticket 12`.
 */
export const recordLabel = (access: RequestAccess, views: readonly ViewModel[], key: (string | number)[], record: Row) => {
  const name = views.find((view) => view.resource === access.entry.name)?.names?.singular ?? access.entry.name
  const title = readableTitle(access, views)
  const value = title === undefined ? undefined : record[title]
  return value === undefined || value === null || value === '' ? `${name} ${encodeKey(key)}` : `${name}: ${String(value)}`
}
