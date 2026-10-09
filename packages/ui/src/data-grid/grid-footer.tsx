import { formatApproxRows, formatInt } from '../format/number'
import { cn } from '../lib/cn'

export type BulkAction = { label: (count: number) => string; destructive?: boolean; onRun: (rows: Array<Record<string, unknown> & { id: string }>) => void }

export type GridFooterProps = {
  total: number
  first: number
  last: number
  selectedCount: number
  bulkActions?: Array<{ label: string; destructive?: boolean; onRun: () => void }>
}

export const GridFooter = ({ total, first, last, selectedCount, bulkActions = [] }: GridFooterProps) => (
  <div className="flex h-9 shrink-0 items-center justify-between border-t bg-surface px-3 text-xs text-muted-foreground">
    <span className="flex items-center tabular-nums">
      {formatApproxRows(total)}
      {selectedCount > 0 && <span className="ml-3 font-medium text-primary-text">{formatInt(selectedCount)} selected</span>}
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
    <span className="tabular-nums">
      Rows {formatInt(first)} &ndash; {formatInt(last)}
    </span>
  </div>
)
