import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { productAt, type InvoiceLine } from '../mocks'
import { Button } from '../primitives/button'
import { lineGrid } from './columns'
import { LineRow } from './line-row'
import { reorder } from './reorder'
import { TotalsFooter } from './totals-footer'
import { text } from './messages'

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

const announcementsFor = (lines: InvoiceLine[]): Announcements => {
  const name = (id: string | number) => lines.find((line) => line.id === id)?.description ?? text('line')
  const place = (id: string | number | undefined) => lines.findIndex((line) => line.id === id) + 1
  return {
    onDragStart: ({ active }) => text('pickedUp', name(active.id), place(active.id), lines.length),
    onDragOver: ({ active, over }) => (over ? text('over', name(active.id), place(over.id), lines.length) : undefined),
    onDragEnd: ({ active, over }) => (over ? text('dropped', name(active.id), place(over.id), lines.length) : text('droppedAtStart', name(active.id))),
    onDragCancel: ({ active }) => text('cancelled', name(active.id), place(active.id)),
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
          <span className={headerCell}>{text('item')}</span>
          <span className={`${headerCell} text-right`}>{text('qty')}</span>
          <span className={`${headerCell} text-right`}>{text('unitPrice')}</span>
          <span className={`${headerCell} text-right`}>{text('lineTotal')}</span>
          <span />
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements: announcementsFor(lines), screenReaderInstructions: { draggable: text('instructions') } }}
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
              {text('addLine')}
            </Button>
          </div>
        )}
      </div>
      <TotalsFooter lines={lines} vatRate={vatRate} />
    </div>
  )
}
