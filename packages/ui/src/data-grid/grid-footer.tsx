import { formatApproxRows, formatInt } from '../format/number'
import { cn } from '../lib/cn'
import { text } from './messages'

export type GridFooterProps = {
  total: number
  selectedCount: number
  bulkActions?: Array<{ label: string; destructive?: boolean; onRun: () => void }>
  className?: string
}

/** How many rows match and, with rows selected, how many and what can be done with them. */
export const GridFooter = ({ total, selectedCount, bulkActions = [], className }: GridFooterProps) => (
  <div className={cn('flex h-9 shrink-0 items-center border-t bg-surface px-3 text-xs text-muted-foreground', className)}>
    <span className="flex items-center tabular-nums">
      {formatApproxRows(total)}
      {selectedCount > 0 && <span className="ml-3 font-medium text-primary-text">{text('selected', formatInt(selectedCount))}</span>}
      {selectedCount > 0 &&
        bulkActions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onRun}
            className={cn('ml-3 rounded border bg-background px-2 py-0.5 font-medium hover:bg-muted', action.destructive ? 'border-danger/40 text-danger-text' : 'text-foreground')}
          >
            {action.label}
          </button>
        ))}
    </span>
  </div>
)
