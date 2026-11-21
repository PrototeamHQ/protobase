import type { ListDragModel, ResourceModel } from '@protobase/schema'
import { dropWrite, type BoardDrop } from './board-drop'

/**
 * The field a board's drop on another column saves the column's value in, with `drag.board` as `{ set, columns }`:
 * `set`, or `by` when it names none. Without that form a drop saves `by` itself, or runs a board drop's write.
 */
export const boardSet = (drag: ListDragModel['board'], by: string) => (typeof drag === 'object' ? (drag.set ?? by) : undefined)

/**
 * Whether a card moves in or out of the board's column of `value`, for a user who may update the resource: with
 * `board: true` any column while `by` is writable; with `{ set, columns }` those `columns` names, or every one, while
 * `set` is writable; with a board drop the columns it lists.
 */
export const boardTakes = (model: ResourceModel, by: string, drag: ListDragModel['board'], drop: BoardDrop | undefined) => (value: string | null) => {
  if (drag === true) return !model.fields[by]?.readOnly
  if (typeof drag === 'object') {
    if (model.fields[drag.set ?? by]?.readOnly) return false
    return drag.columns === undefined || (value !== null && drag.columns.includes(value))
  }
  return drop !== undefined && dropWrite(drop, value) !== undefined
}
