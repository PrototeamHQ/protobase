import { arrayMove } from '@dnd-kit/sortable'
import type { BatchOp, BatchResult } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { recordKey } from '../../live/model-helpers'
import { reorderSpan } from '../hand-order/reorder-span'
import type { DragWrite } from '../hand-order/undo-ops'
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

/** The column's cards once `row` is dropped at `index`, with the first and last place that changed. */
export const placing = (rows: ListDisplayRow[], row: ListDisplayRow, index: number) => {
  const from = rows.findIndex((entry) => entry.key === row.key)
  return { order: placedRows(rows, row, index), first: from === -1 ? index : Math.min(from, index), last: from === -1 ? index : Math.max(from, index) }
}

const etagOf = (row: ListDisplayRow) => (typeof row.record.etag === 'string' ? row.record.etag : '*')

/**
 * The batch that saves a drop on a ranked board: in another column first the update of `by` with the card's ETag, then
 * a `reorder` of the column's cards whose place changed, `first` to `last`, reaching only as far as their ranks need
 * (see `reorderSpan`). The cards after it already rank higher, so they keep their place unwritten, loaded or not. With
 * `bump`, the card, last in the column, takes that rank in a `reorder` of its own before the others are numbered, so
 * it ranks above a record it depends on (see `rankedPlace`).
 */
export const placeOps = (model: ResourceModel, by: string, rank: string, row: ListDisplayRow, column: BoardColumn, order: ListDisplayRow[], first: number, last: number, bump?: number): BatchOp[] => {
  const moving = (row.record[by] ?? null) !== column.value
  const span = reorderSpan(order.map((entry) => entry.record[rank]), first, last)
  const sent = order.slice(span.first, span.last + 1)
  // The update before it checked the moved card's ETag, which it changed
  const etagFor = (entry: ListDisplayRow) => (moving && entry.key === row.key ? '*' : etagOf(entry))
  const reorder = (entries: ListDisplayRow[], start: number): BatchOp => ({
    op: 'reorder',
    resource: model.name,
    field: rank,
    keys: entries.map((entry) => recordKey(model, entry.record)),
    start,
    etags: Object.fromEntries(entries.map((entry) => [encodeKey(recordKey(model, entry.record)), etagFor(entry)])),
  })
  const others = sent.filter((entry) => entry.key !== row.key)
  const reorders = bump === undefined ? [reorder(sent, span.start)] : [reorder([row], bump), ...(others.length > 0 ? [reorder(others, span.start)] : [])]
  if (!moving) return reorders
  return [{ op: 'update', resource: model.name, key: recordKey(model, row.record), data: { [by]: column.value }, etag: etagOf(row) }, ...reorders]
}

/**
 * What the batch of a drop saved: each record it wrote, as it stored it last, with its values in `rows`, the column's
 * cards as listed before the drop, so the drop can be undone.
 */
export const boardWrites = (model: ResourceModel, rows: ListDisplayRow[], result: BatchResult): DragWrite[] => {
  const before = new Map(rows.map((row) => [encodeKey(recordKey(model, row.record)), row.record]))
  const stored = new Map<string, { record: Record<string, unknown>; etag: string }>()
  for (const entry of result.results) {
    const written = entry.op === 'reorder' ? entry.records : entry.op === 'update' ? [entry] : []
    for (const { record, etag } of written) stored.set(encodeKey(recordKey(model, record)), { record, etag })
  }
  return [...stored].flatMap(([key, written]) => {
    const was = before.get(key)
    return was ? [{ before: was, ...written }] : []
  })
}
