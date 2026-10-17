import type { ResourceModel } from '@protobase/schema'
import { useLiveRows } from '../../live/use-live-rows'
import { useAdminMeta } from '../meta-gate'
import { columnFilter } from './board-columns'
import type { ListDisplay } from './display-context'
import { useDisplayRows } from './use-display-rows'

export type BoardColumnParams = {
  model: ResourceModel
  by: string
  value: string | null
  /** The fields the cards show, which the records' relations are labelled for. */
  fields: string[]
  /** The list's filter, its search included, and its order, as the list API takes them. */
  filter: string
  orderBy: string
}

/**
 * The records of one column of a board, page by page through the list API: the list's filter with the column's value
 * added, in the list's order, with how many there are. A change to the resource reloads them, as it does the table.
 */
export const useBoardColumn = ({ model, by, value, fields, filter, orderBy }: BoardColumnParams): ListDisplay => {
  const { resources, views } = useAdminMeta()
  const rows = useLiveRows({ resources, views, model, columns: fields, filter: columnFilter(filter, by, value), orderBy })
  return useDisplayRows(model, rows.page, rows.key, true)
}
