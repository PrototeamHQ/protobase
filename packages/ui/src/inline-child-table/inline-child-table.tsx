import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { productAt, type InvoiceLine } from '../mocks'
import { Button } from '../primitives/button'
import { lineGrid } from './columns'
import { LineRow } from './line-row'
import { reorder } from './reorder'
import { TotalsFooter } from './totals-footer'

export type LineMove = { id: string; from: number; to: number }

export type InlineChildTableProps = {
  lines: InvoiceLine[]
  onChange: (lines: InvoiceLine[]) => void
  /** Called with the new order after a drag or a "Move up" / "Move down"; defaults to `onChange`. */
  onReorder?: (lines: InvoiceLine[], move: LineMove) => void
  vatRate?: number
  /** No editing, adding or removing; lines can still be reordered when `reorderable` is set. */
  readOnly?: boolean
  /** Show the drag handle and the move items; defaults to `!readOnly`. */
  reorderable?: boolean
}

const headerCell = 'px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'

const instructions =
  'To pick up a line, press space or enter on its drag handle. Use the up and down arrow keys to move it, space or enter to drop it, and escape to cancel. The row menu also has Move up and Move down.'

const announcementsFor = (lines: InvoiceLine[]): Announcements => {
  const name = (id: string | number) => lines.find((line) => line.id === id)?.description ?? 'line'
  const place = (id: string | number | undefined) => lines.findIndex((line) => line.id === id) + 1
  return {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, line ${place(active.id)} of ${lines.length}.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} is over line ${place(over.id)} of ${lines.length}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${name(active.id)} was dropped at line ${place(over.id)} of ${lines.length}.` : `${name(active.id)} was dropped where it started.`),
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled. It is back at line ${place(active.id)}.`,
  }
}

export const InlineChildTable = ({ lines, onChange, onReorder, vatRate = 0.21, readOnly, reorderable = !readOnly }: InlineChildTableProps) => {
  // A mouse starts dragging after a few pixels; a finger only after a short press, so scrolling still works.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const move = (from: number, to: number) => {
    const line = lines[from]
    if (!line || to < 0 || to >= lines.length || from === to) return
    ;(onReorder ?? ((next) => onChange(next)))(reorder(lines, from, to), { id: line.id, from, to })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    move(lines.findIndex((line) => line.id === active.id), lines.findIndex((line) => line.id === over.id))
  }

  const addLine = () => {
    const product = productAt(lines.length * 3 + 1)
    onChange([...lines, { id: `new-${lines.length}-${product.id}`, productId: product.id, description: product.name, quantity: 1, unitPriceCents: product.priceCents }])
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className={`${lineGrid} border-b border-border bg-surface px-2 py-2`}>
          <span />
          <span className={headerCell}>Item</span>
          <span className={`${headerCell} text-right`}>Qty</span>
          <span className={`${headerCell} text-right`}>Unit price</span>
          <span className={`${headerCell} text-right`}>Line total</span>
          <span />
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements: announcementsFor(lines), screenReaderInstructions: { draggable: instructions } }}
        >
          <SortableContext items={lines.map((line) => line.id)} strategy={verticalListSortingStrategy}>
            {lines.map((line, index) => (
              <LineRow
                key={line.id}
                line={line}
                position={index}
                count={lines.length}
                reorderable={reorderable}
                editable={!readOnly}
                onChange={(patch) => onChange(lines.map((item) => (item.id === line.id ? { ...item, ...patch } : item)))}
                onRemove={() => onChange(lines.filter((item) => item.id !== line.id))}
                onMove={(to) => move(index, to)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {!readOnly && (
          <div className="border-t border-border bg-surface px-2 py-1.5">
            <Button variant="ghost" size="sm" onClick={addLine}>
              <Plus className="size-3.5" />
              Add line
            </Button>
          </div>
        )}
      </div>
      <TotalsFooter lines={lines} vatRate={vatRate} />
    </div>
  )
}
