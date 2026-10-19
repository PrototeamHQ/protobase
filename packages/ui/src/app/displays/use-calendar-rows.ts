import { useEffect } from 'react'
import type { ResourceModel } from '@protobase/schema'
import { useLiveRows } from '../../live/use-live-rows'
import { useAdminMeta } from '../meta-gate'
import { rangeFilter, withRange, type DatedDisplay, type CalendarRange } from './calendar-range'
import { useDisplayRows } from './use-display-rows'

/** The most records a calendar loads for the days it shows, the most the list API gives in one page. */
export const calendarLimit = 500

export type CalendarRowsParams = {
  model: ResourceModel
  display: DatedDisplay
  range: CalendarRange
  /** The fields the events show, which the records' relations are labelled for. */
  fields: string[]
  /** The list's filter, its search included, as the list API takes it. */
  filter: string
}

/**
 * The records on the days a calendar shows, through the list API: the list's filter with the days added, in start
 * order, page after page up to `calendarLimit`; `capped` when more remain. A change to the resource reloads them, as it
 * does the table.
 */
export const useCalendarRows = ({ model, display, range, fields, filter }: CalendarRowsParams) => {
  const { resources, views } = useAdminMeta()
  const rows = useLiveRows({ resources, views, model, columns: fields, filter: withRange(filter, rangeFilter(display, model, range)), orderBy: `${display.start} asc` })
  const list = useDisplayRows(model, rows.page, rows.key, true)
  const wanted = list.more && !list.loading && list.rows.length < calendarLimit
  useEffect(() => {
    if (wanted) list.loadMore()
  }, [wanted, list.rows.length])
  const capped = list.rows.length > calendarLimit || (list.rows.length === calendarLimit && list.more)
  return { rows: list.rows.slice(0, calendarLimit), capped, loading: list.loading, error: list.error }
}
