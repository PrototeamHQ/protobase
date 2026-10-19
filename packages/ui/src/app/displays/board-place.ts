import { arrayMove } from '@dnd-kit/sortable'
import type { BatchOp } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { recordKey } from '../../live/model-helpers'
import { reorderSpan } from '../hand-order/reorder-span'
import type { BoardColumn } from './board-columns'
import type { ListDisplayRow } from './list-displays'

/** Where a card is dropped: the column, its cards as shown before the drop, and the place among them. */
export type BoardPlace = { column: BoardColumn; rows: ListDisplayRow[]; index: number }

/**
 * The column's cards once `row` is dropped at `index`. In its own column it moves there, as a sortable list moves an
 * item; in another it goes in before the card at `index`, or last.
 */
export const placedRows = (rows: ListDisplayRow[], row: ListDisplayRow, index: number) => {
  const from = rows.findIndex((entry) => entry.key === row.key)
  if (from !== -1) return arrayMove(rows, from, index)
  return [...rows.slice(0, index), row, ...rows.slice(index)]
}

const etagOf = (row: ListDisplayRow) => (typeof row.record.etag === 'string' ? row.record.etag : '*')

/**
 * The batch that saves a drop on a ranked board: in another column first the update of `by` with the card's ETag, then
 * a `reorder` of the column's cards whose place changed, `first` to `last`, reaching only as far as their ranks need
 * (see `reorderSpan`). The cards after it already rank higher, so they keep their place unwritten, loaded or not.
 */
export const placeOps = (model: ResourceModel, by: string, rank: string, row: ListDisplayRow, column: BoardColumn, order: ListDisplayRow[], first: number, last: number): BatchOp[] => {
  const moving = (row.record[by] ?? null) !== column.value
  const span = reorderSpan(order.map((entry) => entry.record[rank]), first, last)
  const sent = order.slice(span.first, span.last + 1)
  // The update before it checked the moved card's ETag, which it changed
  const etags = Object.fromEntries(sent.map((entry) => [encodeKey(recordKey(model, entry.record)), moving && entry.key === row.key ? '*' : etagOf(entry)]))
  const reorder: BatchOp = { op: 'reorder', resource: model.name, field: rank, keys: sent.map((entry) => recordKey(model, entry.record)), start: span.start, etags }
  if (!moving) return [reorder]
  return [{ op: 'update', resource: model.name, key: recordKey(model, row.record), data: { [by]: column.value }, etag: etagOf(row) }, reorder]
}
