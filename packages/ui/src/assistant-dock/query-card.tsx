import { Database } from 'lucide-react'
import { formatCell, type QueryResult } from './model'

/** A read-only query the chat ran, with its rows as a table. */
export const QueryCard = ({ query }: { query: QueryResult }) => (
  <section aria-label="Query result" className="shrink-0 overflow-hidden rounded-lg border border-border-strong bg-background shadow-sm">
    <header className="flex items-start gap-2 bg-surface px-3 py-2">
      <Database className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11px] text-foreground">{query.sql}</code>
    </header>
    {query.rows.length === 0 ? (
      <p className="px-3 py-2 text-xs text-muted-foreground">No rows.</p>
    ) : (
      <div className="max-h-64 overflow-auto">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 bg-background">
            <tr>{query.columns.map((column) => <th key={column} scope="col" className="border-b border-border px-2 py-1 font-semibold whitespace-nowrap">{column}</th>)}</tr>
          </thead>
          <tbody>
            {query.rows.map((row, index) => (
              <tr key={index} className="border-b border-border last:border-b-0">
                {row.map((value, column) => <td key={column} className={value === null ? 'px-2 py-1 whitespace-nowrap text-faint-foreground' : 'px-2 py-1 whitespace-nowrap'}>{formatCell(value)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <footer className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
      {query.rows.length} {query.rows.length === 1 ? 'row' : 'rows'}{query.truncated && ', cut off at the limit'}
    </footer>
  </section>
)
