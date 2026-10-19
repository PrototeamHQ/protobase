import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { cn } from '../../lib/cn'
import { humanize } from '../../live/naming'
import { Button } from '../../primitives/button'
import { Skeleton } from '../../primitives/skeleton'
import { ErrorBanner } from '../error-banner'
import { rowAllows } from '../permissions'
import { ValueBadge } from '../value-badge'
import { boardCard, type BoardColumn, type BoardDisplayModel } from './board-columns'
import { columnId } from './board-dnd'
import type { ListDisplayRow } from './list-displays'
import { RecordCard } from './record-card'
import { useBoardColumn } from './use-board-column'
import type { BoardMove } from './use-board-move'

type ColumnProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: BoardDisplayModel
  fields: string[]
  filter: string
  orderBy: string
  limit?: number
  column: BoardColumn
  moves: BoardMove[]
  /** Whether the user may move a card to another column, and whether to another place: that of the card it is dropped on. */
  movable: boolean
  placeable: boolean
  dragged: () => boolean
}

// The rows shown in the order a ranked drop on its way gives them, those it does not name after them
const inOrder = (rows: ListDisplayRow[], order: string[] | undefined) => {
  if (!order) return rows
  const byKey = new Map(rows.map((row) => [row.key, row]))
  const named = new Set(order)
  return [...order.flatMap((key) => byKey.get(key) ?? []), ...rows.filter((row) => !named.has(row.key))]
}

/**
 * One column of a board: its loaded records, those on their way out shown in their new column, and those on their way
 * in at its top, or on a ranked board at the place they were dropped.
 */
export const BoardColumnView = ({ model, view, display, column, fields, filter, orderBy, limit, moves, movable, placeable, dragged }: ColumnProps) => {
  const list = useBoardColumn({ model, by: display.by, value: column.value, fields, filter, orderBy })
  const card = boardCard(model, view, display)
  const loaded = new Set(list.rows.map((row) => row.key))
  const moving = new Map(moves.map((entry) => [entry.row.key, entry]))
  const leaving = list.rows.filter((row) => moving.has(row.key) && moving.get(row.key)!.to !== column.value)
  const arriving = moves.filter((entry) => entry.to === column.value && !loaded.has(entry.row.key)).map((entry) => entry.row)
  const staying = list.rows.filter((row) => !leaving.includes(row)).map((row) => (moving.has(row.key) ? moving.get(row.key)!.row : row))
  const placing = moves.findLast((entry) => entry.to === column.value && entry.order)
  const rows = inOrder([...arriving, ...staying], placing?.order).slice(0, limit)
  const { setNodeRef, isOver } = useDroppable({ id: columnId(column.value), data: { column, rows } })
  const count = list.total - leaving.length + arriving.length
  // The column of records without a value shows only while some are in it
  if (column.value === null && !list.loading && count === 0 && !isOver) return null

  const plural = (view?.names?.plural ?? humanize(model.name)).toLowerCase()
  const hints = view?.fields[display.by]
  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.label}, ${count}`}
      className={cn('flex w-72 shrink-0 snap-start flex-col gap-2 rounded-lg bg-surface p-2', isOver && 'ring-2 ring-primary/30')}
    >
      <header className="flex items-center justify-between gap-2 px-1 pt-0.5">
        <h2 className="min-w-0 truncate text-xs font-medium">
          {column.value === null ? (
            <span className="text-muted-foreground">{column.label}</span>
          ) : (
            <ValueBadge value={column.value} hints={hints}>
              {column.label}
            </ValueBadge>
          )}
        </h2>
        {!list.loading && <span className="text-xs tabular-nums text-muted-foreground">{count.toLocaleString('en-IE')}</span>}
      </header>
      {list.loading ? (
        Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20" />)
      ) : list.error ? (
        <ErrorBanner title="Could not load rows" error={list.error} />
      ) : rows.length === 0 ? (
        <p className="px-1 py-4 text-center text-xs text-muted-foreground">No {plural}</p>
      ) : (
        // Cards tile without gaps, so a pointer in the column is over a card or below the last one
        <SortableContext id={columnId(column.value)} items={rows.map((row) => row.key)} strategy={verticalListSortingStrategy}>
          <ul className="-mb-2 flex flex-col">
            {rows.map((row) => (
              <BoardCard
                key={row.key}
                model={model}
                view={view}
                card={card}
                row={row}
                column={column}
                rows={rows}
                draggable={(movable || placeable) && rowAllows(row.record, 'update')}
                placeable={placeable}
                dragged={dragged}
              />
            ))}
          </ul>
        </SortableContext>
      )}
      {limit === undefined && list.more && (
        <Button size="sm" variant="ghost" onClick={list.loadMore}>
          Show more
        </Button>
      )}
    </section>
  )
}

type CardProps = {
  model: ResourceModel
  view: ViewModel | undefined
  card: ReturnType<typeof boardCard>
  row: ListDisplayRow
  column: BoardColumn
  rows: ListDisplayRow[]
  draggable: boolean
  placeable: boolean
  dragged: () => boolean
}

/**
 * A record's card, picked up by dragging it or by Space on its link; one the user may not update stays put. Where the
 * user may change the order of a ranked board, a card is dropped on too: in its own column the cards make room as it
 * moves, in another a bar marks its place.
 */
const BoardCard = ({ model, view, card, row, column, rows, draggable, placeable, dragged }: CardProps) => {
  const { setNodeRef, setActivatorNodeRef, listeners, isDragging, isOver, active, transform, transition } = useSortable({
    id: row.key,
    data: { row, column, rows },
    disabled: { draggable: !draggable, droppable: !placeable },
  })
  const arriving = isOver && (active?.data.current?.column as BoardColumn | undefined)?.value !== column.value
  return (
    <li
      ref={(element) => {
        setNodeRef(element)
        // Space picks the card up from its link, which has the focus
        setActivatorNodeRef(element?.querySelector('a') ?? element)
      }}
      {...listeners}
      // The card is a link, which the browser would drag as one
      onDragStart={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (!dragged()) return
        event.preventDefault()
        event.stopPropagation()
      }}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}
      className={cn(
        'relative pb-2',
        draggable && 'cursor-grab touch-manipulation',
        isDragging && 'opacity-40',
        arriving && 'before:absolute before:inset-x-0 before:-top-1 before:h-0.5 before:rounded-full before:bg-primary',
      )}
    >
      <RecordCard model={model} view={view} display={card} row={row} swipe={false} />
    </li>
  )
}
