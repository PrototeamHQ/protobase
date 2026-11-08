import { arrayMove } from '@dnd-kit/sortable'
import type { BatchOp, BatchResult } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { recordKey } from '../../live/model-helpers'
import { anchoredMove } from '../hand-order/anchored-move'
import type { DragWrite } from '../hand-order/undo-ops'
import { columnFilter, type BoardColumn } from './board-columns'
import type { ListDisplayRow } from './list-displays'

/** Where a card is dropped: the column, its cards as shown before the drop, whether more follow them, and the place among them. */
export type BoardPlace = { column: BoardColumn; rows: ListDisplayRow[]; more: boolean; index: number }

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

/**
 * The batch that saves a drop on a ranked board: in another column first the update of `by`, then a `move` of the card
 * to its place in `order`, the column's cards once dropped, anchored to the cards around it (see `anchoredMove`) in
 * the column `filter` reads, so it saves whatever else changed meanwhile; with `more` cards after `order`, unloaded. With `bump`, the card, last in the column,
 * first takes that rank in a `reorder` of its own, so it ranks above a record it depends on (see `rankedPlace`), and the
 * `move` then only checks its place. The update and the bump write any version, as the `move` decides the order.
 */
export const placeOps = (model: ResourceModel, by: string, rank: string, filter: string, row: ListDisplayRow, column: BoardColumn, order: ListDisplayRow[], more: boolean, bump?: number): BatchOp[] => {
  const key = recordKey(model, row.record)
  const index = order.findIndex((entry) => entry.key === row.key)
  const move = anchoredMove(model, rank, columnFilter(filter, by, column.value), order.map((entry) => entry.record), index, more)
  const bumped: BatchOp[] = bump === undefined ? [] : [{ op: 'reorder', resource: model.name, field: rank, keys: [key], start: bump, etags: { [encodeKey(key)]: '*' } }]
  const moving = (row.record[by] ?? null) !== column.value
  const update: BatchOp[] = moving ? [{ op: 'update', resource: model.name, key, data: { [by]: column.value }, etag: '*' }] : []
  return [...update, ...bumped, move]
}

/**
 * What the batch of a drop saved: each record it wrote, as it stored it last, with its values in `rows`, the column's
 * cards as listed before the drop, so the drop can be undone.
 */
export const boardWrites = (model: ResourceModel, rows: ListDisplayRow[], result: BatchResult): DragWrite[] => {
  const before = new Map(rows.map((row) => [encodeKey(recordKey(model, row.record)), row.record]))
  const stored = new Map<string, { record: Record<string, unknown>; etag: string }>()
  for (const entry of result.results) {
    const written = entry.op === 'reorder' || entry.op === 'move' ? entry.records : entry.op === 'update' ? [entry] : []
    for (const { record, etag } of written) stored.set(encodeKey(recordKey(model, record)), { record, etag })
  }
  return [...stored].flatMap(([key, written]) => {
    const was = before.get(key)
    return was ? [{ before: was, ...written }] : []
  })
}
