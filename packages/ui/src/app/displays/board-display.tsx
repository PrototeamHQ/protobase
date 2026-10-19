import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type Announcements, type DragEndEvent, type DragStartEvent, type Over } from '@dnd-kit/core'
import { useRef, useState } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { listHandOrder } from '../hand-order/hand-order'
import { usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { BoardColumnView } from './board-column'
import { columnsAllowed } from './board-allowed'
import { Problem } from '../pages/problem'
import { useProjectUi } from '../pages/project-ui'
import { boardCard, boardColumns, boardRank, type BoardColumn, type BoardDisplayModel } from './board-columns'
import { cardCoordinates, collision, columnId } from './board-dnd'
import { dropWrite } from './board-drop'
import { placedRows, type BoardPlace } from './board-place'
import type { ListDisplayRow } from './list-displays'
import { RecordCard } from './record-card'
import { useBoardMove } from './use-board-move'

type BoardProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: BoardDisplayModel
  /** The fields the cards show, which the records' relations are labelled for. */
  fields: string[]
  /** The list's filter, its search included, and its order, as the list API takes them. */
  filter: string
  orderBy: string
  /** The most cards a column shows, without a button for more, as an embedded list shows them. */
  limit?: number
}

// Where a card over `over` would be dropped: before the card it is over, or after the last card of the column
const placeOver = (over: Over, row: ListDisplayRow): BoardPlace | undefined => {
  const data = over.data.current as { column?: BoardPlace['column']; rows?: ListDisplayRow[]; sortable?: { index: number } } | undefined
  if (!data?.column || !data.rows) return undefined
  if (data.sortable) return { column: data.column, rows: data.rows, index: data.sortable.index }
  const own = data.rows.some((entry) => entry.key === row.key)
  return { column: data.column, rows: data.rows, index: own ? data.rows.length - 1 : data.rows.length }
}

/**
 * A column per value of the board's enum field, each loading its own records through the list API, with their count.
 * When the list's `drag.board` is on, a card dragged, or moved with the keyboard, to another column saves the record
 * with that column's value; when it names a board drop of the UI config, only between the columns it names, each
 * running its own write. When the resource has a position, its records ordered as one, the columns are in its order,
 * and when `drag.rank` is on a card is dropped at a place: the up and down arrow keys move it within its column, and
 * the drop renumbers the cards before it. Each change says so with **Undo**.
 */
export const BoardDisplay = ({ model, view, display, fields, filter, orderBy, limit }: BoardProps) => {
  const every = boardColumns(model, view, display)
  const columns = columnsAllowed(filter, display.by, every)
  const card = boardCard(model, view, display)
  const permissions = usePermissions(model.name)
  const { boardDrops } = useProjectUi()
  const drag = view?.list?.drag
  const dropName = typeof drag?.board === 'string' ? drag.board : undefined
  const drop = dropName === undefined ? undefined : boardDrops?.[dropName]
  // Whether a card moves in or out of a column: any with `board: true`, else those the named board drop lists
  const takes = (value: string | null) =>
    can(permissions, 'update') && (drag?.board === true ? !model.fields[display.by]?.readOnly : drop !== undefined && dropWrite(drop, value) !== undefined)
  const movable = columns.some((column) => takes(column.value))
  const rank = boardRank(model)
  // Changing the order takes the same right as sorting the list by hand
  const placeable = drag?.rank === true && rank !== undefined && listHandOrder(model, permissions) !== undefined
  const columnOrder = rank ? `${rank} asc` : orderBy
  const labelOf = (value: string | null) => every.find((column) => column.value === value)?.label ?? String(value)
  const { moves, move } = useBoardMove({ model, by: display.by, rank, drop, labelOf })
  const [active, setActive] = useState<ListDisplayRow | undefined>()
  // The click that ends a drag with a mouse lands on the card's link, which must not open the record
  const dragged = useRef(false)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Enter opens the card's record, so only Space picks a card up
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] }, coordinateGetter: cardCoordinates }),
  )
  if (dropName !== undefined && !drop) return <Problem>No board drop is registered as {dropName}. Give it in boardDrops in protobase.ui.tsx, or load the plugin that provides it.</Problem>

  const title = (row: ListDisplayRow) => String(row.labels[card.title!] ?? row.record[card.title!] ?? row.key)
  const columnOf = (id: unknown) => columns.find((column) => columnId(column.value) === id)
  const valueOf = (row: ListDisplayRow) => (row.record[display.by] ?? null) as string | null
  const crosses = (row: ListDisplayRow, to: BoardColumn) => takes(valueOf(row)) && takes(to.value)
  const announced = (row: ListDisplayRow, over: Over | null) => {
    if (!over) return { over: 'no column' }
    const place = placeable ? placeOver(over, row) : undefined
    if (!place) return { over: columnOf(over.id)?.label ?? 'no column' }
    const count = place.rows.some((entry) => entry.key === row.key) ? place.rows.length : place.rows.length + 1
    return { over: `${place.column.label}, place ${place.index + 1} of ${count}`, place: `${place.column.label}, place ${place.index + 1}` }
  }
  // Whether a drop on `over` takes the card to a column it may not move to
  const refused = (row: ListDisplayRow, over: Over) => {
    const target = (placeable ? placeOver(over, row)?.column : undefined) ?? columnOf(over.id)
    return target !== undefined && target.value !== valueOf(row) && !crosses(row, target)
  }
  const announcements: Announcements = {
    onDragStart: ({ active: picked }) => `Picked up ${title(picked.data.current!.row)}.`,
    onDragOver: ({ active: picked, over }) => `${title(picked.data.current!.row)} is over ${announced(picked.data.current!.row, over).over}.`,
    onDragEnd: ({ active: picked, over }) => {
      const row = picked.data.current!.row as ListDisplayRow
      if (!over || refused(row, over)) return `${title(row)} was put back.`
      const said = announced(row, over)
      return `${title(row)} was moved to ${said.place ?? said.over}.`
    },
    onDragCancel: ({ active: picked }) => `Moving ${title(picked.data.current!.row)} was cancelled.`,
  }

  const start = ({ active: picked }: DragStartEvent) => {
    dragged.current = true
    setActive(picked.data.current!.row as ListDisplayRow)
  }
  const end = ({ active: picked, over }: DragEndEvent) => {
    setActive(undefined)
    setTimeout(() => (dragged.current = false))
    const row = picked.data.current!.row as ListDisplayRow
    if (!over) return
    const place = placeable ? placeOver(over, row) : undefined
    if (!place) {
      const target = columnOf(over.id)
      if (target && target.value !== valueOf(row) && crosses(row, target)) move(row, target)
      return
    }
    const from = place.rows.findIndex((entry) => entry.key === row.key)
    // A card the user may not move to another column goes back
    if (from === -1 && !crosses(row, place.column)) return
    // A board drop's write decides where the card lands in another column, so it has no place there
    if (from === -1 && drop) return move(row, place.column)
    if (from === place.index) return
    const order = placedRows(place.rows, row, place.index)
    move(row, place.column, { order, first: from === -1 ? place.index : Math.min(from, place.index), last: from === -1 ? place.index : Math.max(from, place.index) })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={() => {
        setActive(undefined)
        setTimeout(() => (dragged.current = false))
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: !placeable
            ? 'To move a card to another column, press Space, move it with the left and right arrow keys, and press Space again to drop it there. Escape puts it back.'
            : movable
              ? 'To move a card, press Space, move it with the up and down arrow keys within its column and the left and right arrow keys to another column, and press Space again to drop it there. Escape puts it back.'
              : 'To move a card, press Space, move it with the up and down arrow keys within its column, and press Space again to drop it there. Escape puts it back.',
        },
      }}
    >
      {/* As tall as its longest column, scrolling with the page, and sideways when its columns are wider than the page; positioned, so what its cards place absolutely, such as their screen-reader labels, scrolls inside it instead of widening the page */}
      <div className="relative min-w-0 flex-1 overflow-x-auto">
        <div className="flex snap-x items-start gap-3 pb-2">
          {columns.map((column) => (
            <BoardColumnView
              key={columnId(column.value)}
              model={model}
              view={view}
              display={display}
              column={column}
              fields={fields}
              filter={filter}
              orderBy={columnOrder}
              limit={limit}
              moves={moves}
              movable={takes(column.value)}
              placeable={placeable}
              dragged={() => dragged.current}
            />
          ))}
        </div>
      </div>
      <DragOverlay>{active && <RecordCard model={model} view={view} display={card} row={active} swipe={false} />}</DragOverlay>
    </DndContext>
  )
}
