import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'
import type { GridRow } from './column-spec'
import { DataRow, type DataRowProps } from './grid-row'

/** Rows moved by a drag handle in place of their checkbox: `onMove` gets the row's index and the index it is dropped at. */
export type RowReorder = {
  onMove: (from: number, to: number) => void
  /** How a row reads to a screen reader, such as its title. */
  label: (row: GridRow) => string
}

const instructions = 'To move a row, press Space on its handle, move it with the up and down arrow keys, and press Space again to drop it there. Escape puts it back.'

/** The rows of a grid that are moved by hand, `ids` in their order, each loaded or not, so the drop's index is the row's place in the whole list. */
export const ReorderRows = ({ ids, rowAt, reorder, children }: { ids: string[]; rowAt: (index: number) => GridRow | undefined; reorder: RowReorder; children: ReactNode }) => {
  // A mouse starts dragging after a few pixels; a finger only after a short press, so the page still scrolls
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const place = (id: string | number | undefined) => ids.indexOf(String(id))
  const name = (id: string | number) => {
    const row = rowAt(place(id))
    return row ? reorder.label(row) : 'row'
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, row ${place(active.id) + 1} of ${ids.length}.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} is over row ${place(over.id) + 1} of ${ids.length}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${name(active.id)} was dropped at row ${place(over.id) + 1} of ${ids.length}.` : `${name(active.id)} was put back.`),
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled. It is back at row ${place(active.id) + 1}.`,
  }
  const end = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    reorder.onMove(place(active.id), place(over.id))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end} accessibility={{ announcements, screenReaderInstructions: { draggable: instructions } }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

/** A row moved by its handle, which takes the checkbox's place; it follows the pointer up and down only. */
export const SortableRow = ({ row, label, ...props }: Omit<DataRowProps, 'handle' | 'rowRef' | 'transition' | 'dragging'> & { row: GridRow; label: string }) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id })
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      aria-label={`Move ${label}`}
      {...attributes}
      {...listeners}
      // The row opens its record on a click, which the handle is not
      onClick={(event) => event.stopPropagation()}
      style={{ touchAction: 'none' }}
      className="flex size-7 cursor-grab items-center justify-center rounded text-faint-foreground hover:bg-muted hover:text-foreground focus-visible:text-foreground active:cursor-grabbing pointer-coarse:size-9"
    >
      <GripVertical className="size-4" />
    </button>
  )
  return <DataRow {...props} offset={props.offset + (transform?.y ?? 0)} rowRef={setNodeRef} handle={handle} transition={transition} dragging={isDragging} />
}
