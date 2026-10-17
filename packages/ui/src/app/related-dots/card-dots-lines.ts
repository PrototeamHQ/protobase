import type { ListDisplayModel, RelatedColumnModel, ViewModel } from '@protobase/schema'
import type { ListDisplayRow } from '../displays/list-displays'

/** A line of dots a card shows: a related column of the list and the records the list loaded with the row for it. */
export type CardDotsLine = { column: RelatedColumnModel; records: Array<Record<string, unknown>> }

/**
 * The lines of dots a card of `display` shows for a row, in the order it names their columns: those of the list's
 * related columns that were loaded with the row and hold a record. A row loaded without them, as a map's or a saved
 * search's, shows none.
 */
export const cardDotsLines = (view: ViewModel | undefined, display: Extract<ListDisplayModel, { kind: 'cards' }>, row: ListDisplayRow): CardDotsLine[] =>
  (display.dots ?? []).flatMap((name) => {
    const column = view?.list?.relatedColumns?.find((candidate) => candidate.name === name)
    const records = row.record[name]
    return column && Array.isArray(records) && records.length > 0 ? [{ column, records: records as CardDotsLine['records'] }] : []
  })
