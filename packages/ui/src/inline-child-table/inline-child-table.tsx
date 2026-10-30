import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Button } from '../primitives/button'
import { lineGrid, lineGridStyle, type LineColumn } from './columns'
import { LineRow } from './line-row'
import { reorder } from './reorder'
import { text } from './messages'

export type LineMove = { id: string; from: number; to: number }

export type InlineChildTableProps<L extends { id: string }> = {
  lines: L[]
  columns: LineColumn<L>[]
  /** How a line is named to a screen reader and in its menu. */
  lineName: (line: L) => string
  /** Called with the new order after a drag or a "Move up" / "Move down". */
  onReorder?: (lines: L[], move: LineMove) => void
  /** Show the drag handle and the move items; defaults to whether `onReorder` is given. */
  reorderable?: boolean
  /** Shows "Add line" under the lines. */
  onAdd?: () => void
  /** Gives the menu of each line that is `removable` "Remove line". */
  onRemove?: (line: L) => void
  /** Whether a line can be removed; every line when omitted. */
  removable?: (line: L) => boolean
  /** Why the server turned a line down, shown under it. */
  lineError?: (line: L) => string | undefined
  /** Under the table, such as the totals. */
  footer?: ReactNode
}

const headerCell = 'px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'

const announcementsFor = <L extends { id: string }>(lines: L[], lineName: (line: L) => string): Announcements => {
  const name = (id: string | number) => {
    const line = lines.find((each) => each.id === id)
    return line ? lineName(line) : text('line')
  }
  const place = (id: string | number | undefined) => lines.findIndex((line) => line.id === id) + 1
  return {
    onDragStart: ({ active }) => text('pickedUp', { name: name(active.id), place: place(active.id), count: lines.length }),
    onDragOver: ({ active, over }) => (over ? text('over', { name: name(active.id), place: place(over.id), count: lines.length }) : undefined),
    onDragEnd: ({ active, over }) => (over ? text('dropped', { name: name(active.id), place: place(over.id), count: lines.length }) : text('droppedAtStart', { name: name(active.id) })),
    onDragCancel: ({ active }) => text('cancelled', { name: name(active.id), place: place(active.id) }),
  }
}

/** The lines of a record as rows of the given columns, put in order by dragging or from each row's menu. */
export const InlineChildTable = <L extends { id: string }>({ lines, columns, lineName, onReorder, reorderable = Boolean(onReorder), onAdd, onRemove, removable = () => true, lineError, footer }: InlineChildTableProps<L>) => {
  // A mouse starts dragging after a few pixels; a finger only after a short press, so scrolling still works.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const move = (from: number, to: number) => {
    const line = lines[from]
    if (!line || !onReorder || to < 0 || to >= lines.length || from === to) return
    onReorder(reorder(lines, from, to), { id: line.id, from, to })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    move(lines.findIndex((line) => line.id === active.id), lines.findIndex((line) => line.id === over.id))
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-border bg-background" style={lineGridStyle(columns)}>
        <div className={`${lineGrid} border-b border-border bg-surface px-2 py-2`}>
          <span />
          {columns.map((column) => (
            <span key={column.key} className={cn(headerCell, column.align === 'right' && 'text-right')}>
              {column.label}
            </span>
          ))}
          <span />
        </div>
        {lines.length === 0 && <p className="px-4 py-3 text-muted-foreground">{text('noLines')}</p>}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements: announcementsFor(lines, lineName), screenReaderInstructions: { draggable: text('instructions') } }}
        >
          <SortableContext items={lines.map((line) => line.id)} strategy={verticalListSortingStrategy}>
            {lines.map((line, index) => (
              <LineRow
                key={line.id}
                line={line}
                name={lineName(line)}
                columns={columns}
                position={index}
                count={lines.length}
                reorderable={reorderable}
                onRemove={onRemove && removable(line) ? () => onRemove(line) : undefined}
                onMove={(to) => move(index, to)}
                error={lineError?.(line)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {onAdd && (
          <div className="border-t border-border bg-surface px-2 py-1.5">
            <Button variant="ghost" size="sm" onClick={onAdd}>
              <Plus className="size-3.5" />
              {text('addLine')}
            </Button>
          </div>
        )}
      </div>
      {footer}
    </div>
  )
}
