import type { ListDragModel, ResourceModel } from '@protobase/schema'
import { dropWrite, type BoardDrop } from './board-drop'

/**
 * The field a board's drop on another column saves the column's value in, with `drag.board` as `{ set, columns }`:
 * `set`, or `by` when it names none. Without that form a drop saves `by` itself, or runs a board drop's write.
 */
export const boardSet = (drag: ListDragModel['board'], by: string) => (typeof drag === 'object' ? (drag.set ?? by) : undefined)

/**
 * Whether the board's cards may carry the `set` field, which Undo puts back: only when the caller reads it, since the
 * list API refuses a field they cannot read, and nothing lists a sensitive or write-only one. A move of a card without
 * it saves without **Undo**.
 */
export const readsSet = (model: ResourceModel, set: string) => {
  const field = model.fields[set]
  return field !== undefined && !field.writeOnly && !field.sensitive
}

/**
 * Whether a card moves in or out of the board's column of `value`, for a user who may update the resource: with
 * `board: true` any column while `by` is writable; with `{ set, columns }` those `columns` names, or every one, while
 * the caller may write `set`; with a board drop the columns it lists.
 */
export const boardTakes = (model: ResourceModel, by: string, drag: ListDragModel['board'], drop: BoardDrop | undefined) => (value: string | null) => {
  if (drag === true) return !model.fields[by]?.readOnly
  if (typeof drag === 'object') {
    // A field the caller has neither to read nor to write is not in their model, and a drop could not save it
    const set = model.fields[drag.set ?? by]
    if (!set || set.readOnly) return false
    return drag.columns === undefined || (value !== null && drag.columns.includes(value))
  }
  return drop !== undefined && dropWrite(drop, value) !== undefined
}
