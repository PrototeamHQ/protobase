import { cn } from '../lib/cn'
import { formatCell } from './format-cell'

export type CompactTableProps = {
  columns: string[]
  rows: unknown[][]
  /** Above the table, in monospace: what the rows are, such as the query that read them. */
  caption?: string
  /** The rows stop at a limit. */
  truncated?: boolean
  className?: string
}

/** A small read-only table of raw values with a row count, for narrow places such as a side panel. */
export const CompactTable = ({ columns, rows, caption, truncated, className }: CompactTableProps) => (
  <section aria-label={caption ?? 'Table'} className={cn('shrink-0 overflow-hidden rounded-lg border border-border-strong bg-background shadow-sm', className)}>
    {caption && <code className="block whitespace-pre-wrap break-words bg-surface px-3 py-2 font-mono text-[11px] text-foreground">{caption}</code>}
    {rows.length === 0 ? (
      <p className="px-3 py-2 text-xs text-muted-foreground">No rows.</p>
    ) : (
      <div className="max-h-64 overflow-auto">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 bg-background">
            <tr>{columns.map((column) => <th key={column} scope="col" className="border-b border-border px-2 py-1 font-semibold whitespace-nowrap">{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border last:border-b-0">
                {row.map((value, column) => <td key={column} className={cn('px-2 py-1 whitespace-nowrap', value === null && 'text-faint-foreground')}>{formatCell(value)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <footer className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
      {rows.length} {rows.length === 1 ? 'row' : 'rows'}{truncated && ', cut off at the limit'}
    </footer>
  </section>
)
