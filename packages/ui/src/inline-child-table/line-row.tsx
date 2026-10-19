import { useSortable } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'
import { formatMoney } from '../format'
import { cn } from '../lib/cn'
import { lineTotalCents, type InvoiceLine } from '../mocks'
import { lineGrid } from './columns'
import { LineMenu, type LineMenuItem } from './line-menu'
import { NumberCell } from './number-cell'
import { text } from './messages'

export type LineRowProps = {
  line: InvoiceLine
  position: number
  count: number
  /** The line can be dragged and moved with the menu. */
  reorderable: boolean
  /** The fields can be edited and the line removed. */
  editable: boolean
  onChange: (patch: Partial<InvoiceLine>) => void
  onRemove: () => void
  onMove: (to: number) => void
}

const parseEuros = (typed: string) => Math.round(Number(typed.replace(',', '.').replace(/[^0-9.]/g, '')) * 100)

export const LineRow = ({ line, position, count, reorderable, editable, onChange, onRemove, onMove }: LineRowProps) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: line.id, disabled: !reorderable })
  const menu: LineMenuItem[] = [
    ...(reorderable
      ? [
          { label: text('moveUp'), disabled: position === 0, onSelect: () => onMove(position - 1) },
          { label: text('moveDown'), disabled: position === count - 1, onSelect: () => onMove(position + 1) },
        ]
      : []),
    ...(editable ? [{ label: text('removeLine'), destructive: true, onSelect: onRemove }] : []),
  ]

  return (
    <div
      ref={setNodeRef}
      data-line-id={line.id}
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      className={cn('group relative border-b border-border bg-background px-2 py-1 last:border-b-0 hover:bg-surface', lineGrid, isDragging && 'z-10 bg-surface opacity-80 shadow-pop')}
    >
      {reorderable ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={text('dragToReorder', line.description)}
          {...attributes}
          {...listeners}
          style={{ touchAction: 'none' }}
          className="flex size-7 cursor-grab items-center justify-center rounded text-faint-foreground opacity-60 hover:bg-muted hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing pointer-coarse:size-11"
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span />
      )}
      <div className="min-w-0">
        <p className="truncate text-foreground">{line.description}</p>
        <p className="font-mono text-[11px] text-faint-foreground">{line.productId}</p>
      </div>
      {editable ? (
        <NumberCell label={text('quantity')} value={line.quantity} format={String} parse={(typed) => Math.round(Number(typed))} onCommit={(quantity) => onChange({ quantity })} />
      ) : (
        <span className="px-2 text-right tabular-nums">{line.quantity}</span>
      )}
      {editable ? (
        <NumberCell label={text('unitPrice')} value={line.unitPriceCents} format={(cents) => (cents / 100).toFixed(2)} parse={parseEuros} onCommit={(unitPriceCents) => onChange({ unitPriceCents })} />
      ) : (
        <span className="px-2 text-right tabular-nums">{(line.unitPriceCents / 100).toFixed(2)}</span>
      )}
      <span className="px-2 text-right font-medium tabular-nums text-foreground">{formatMoney(lineTotalCents(line))}</span>
      {menu.length > 0 ? <LineMenu label={text('actionsFor', line.description)} items={menu} /> : <span />}
    </div>
  )
}
