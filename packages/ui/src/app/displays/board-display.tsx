import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type Announcements, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useRef, useState } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { BoardColumnView } from './board-column'
import { columnsAllowed } from './board-allowed'
import { boardCard, boardColumns, type BoardDisplayModel } from './board-columns'
import { collision, columnCoordinates, columnId } from './board-dnd'
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

/**
 * A column per value of the board's enum field, each loading its own records through the list API, with their count;
 * a card dragged, or moved with the keyboard, to another column saves the record with that column's value.
 */
export const BoardDisplay = ({ model, view, display, fields, filter, orderBy, limit }: BoardProps) => {
  const columns = columnsAllowed(filter, display.by, boardColumns(model, view, display))
  const card = boardCard(model, view, display)
  const permissions = usePermissions(model.name)
  const movable = can(permissions, 'update') && !model.fields[display.by]?.readOnly
  const { moves, move } = useBoardMove(model, display.by)
  const [active, setActive] = useState<ListDisplayRow | undefined>()
  // The click that ends a drag with a mouse lands on the card's link, which must not open the record
  const dragged = useRef(false)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Enter opens the card's record, so only Space picks a card up
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] }, coordinateGetter: columnCoordinates }),
  )

  const title = (row: ListDisplayRow) => String(row.labels[card.title!] ?? row.record[card.title!] ?? row.key)
  const columnOf = (id: unknown) => columns.find((column) => columnId(column.value) === id)
  const valueOf = (row: ListDisplayRow) => (row.record[display.by] ?? null) as string | null
  const announcements: Announcements = {
    onDragStart: ({ active: picked }) => `Picked up ${title(picked.data.current!.row)}.`,
    onDragOver: ({ active: picked, over }) => `${title(picked.data.current!.row)} is over ${over ? columnOf(over.id)?.label : 'no column'}.`,
    onDragEnd: ({ active: picked, over }) => (over ? `${title(picked.data.current!.row)} was moved to ${columnOf(over.id)?.label}.` : `${title(picked.data.current!.row)} was put back.`),
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
    const target = over ? columnOf(over.id) : undefined
    if (target && target.value !== valueOf(row)) move(row, target)
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
        screenReaderInstructions: { draggable: 'To move a card to another column, press Space, move it with the left and right arrow keys, and press Space again to drop it there. Escape puts it back.' },
      }}
    >
      {/* As tall as its longest column, scrolling with the page, and sideways when its columns are wider than the page */}
      <div className="min-w-0 flex-1 overflow-x-auto">
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
              orderBy={orderBy}
              limit={limit}
              moves={moves}
              movable={movable}
              dragged={() => dragged.current}
            />
          ))}
        </div>
      </div>
      <DragOverlay>{active && <RecordCard model={model} view={view} display={card} row={active} swipe={false} />}</DragOverlay>
    </DndContext>
  )
}
