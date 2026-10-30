import { useSortable } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'
import { cn } from '../lib/cn'
import { lineGrid, type LineColumn } from './columns'
import { LineMenu, type LineMenuItem } from './line-menu'
import { text } from './messages'

export type LineRowProps<L extends { id: string }> = {
  line: L
  /** How the line is named to a screen reader and in its menu. */
  name: string
  columns: LineColumn<L>[]
  position: number
  count: number
  /** The line can be dragged and moved with the menu. */
  reorderable: boolean
  /** The menu has "Remove line", which calls this. */
  onRemove?: () => void
  onMove: (to: number) => void
  /** Why the server turned the line down, under its cells. */
  error?: string
}

export const LineRow = <L extends { id: string }>({ line, name, columns, position, count, reorderable, onRemove, onMove, error }: LineRowProps<L>) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: line.id, disabled: !reorderable })
  const menu: LineMenuItem[] = [
    ...(reorderable
      ? [
          { label: text('moveUp'), disabled: position === 0, onSelect: () => onMove(position - 1) },
          { label: text('moveDown'), disabled: position === count - 1, onSelect: () => onMove(position + 1) },
        ]
      : []),
    ...(onRemove ? [{ label: text('removeLine'), destructive: true, onSelect: onRemove }] : []),
  ]

  return (
    <div
      ref={setNodeRef}
      data-line-id={line.id}
      aria-invalid={error ? true : undefined}
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      className={cn('group relative border-b border-border bg-background px-2 py-1 last:border-b-0 hover:bg-surface', lineGrid, isDragging && 'z-10 bg-surface opacity-80 shadow-pop', error && 'bg-danger-soft')}
    >
      {reorderable ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={text('dragToReorder', { name })}
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
      {columns.map((column) => (
        <div key={column.key} className={cn('min-w-0', column.align === 'right' && 'text-right')}>
          {column.cell(line)}
        </div>
      ))}
      {menu.length > 0 ? <LineMenu label={text('actionsFor', { name })} items={menu} /> : <span />}
      {error && (
        <p role="alert" className="col-span-full px-2 pb-1 text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}
