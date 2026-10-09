import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

export type RelatedRecord = { kind: string; label: string; meta?: string; href?: string }

export type MetadataRow = { label: string; value: ReactNode }

export const MetadataList = ({ rows }: { rows: MetadataRow[] }) => (
  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
    {rows.map((row) => (
      <div key={row.label} className="contents">
        <dt className="text-muted-foreground">{row.label}</dt>
        <dd className="text-right tabular-nums text-foreground">{row.value}</dd>
      </div>
    ))}
  </dl>
)

export const RelatedRecords = ({ records, onNavigate }: { records: RelatedRecord[]; onNavigate?: (href: string) => void }) => (
  <ul className="-mx-2">
    {records.map((record) => (
      <li key={record.label}>
        <a
          href={record.href ?? '#'}
          onClick={(event) => {
            event.preventDefault()
            if (record.href) onNavigate?.(record.href)
          }}
          className="group flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted">
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-wide text-faint-foreground">{record.kind}</span>
            <span className="block truncate text-[13px] font-medium text-primary-text">{record.label}</span>
            {record.meta && <span className="block text-xs text-muted-foreground">{record.meta}</span>}
          </span>
          <ChevronRight className="size-4 shrink-0 text-faint-foreground group-hover:text-foreground" />
        </a>
      </li>
    ))}
  </ul>
)

export const SidebarCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="rounded-lg border border-border bg-background p-4">
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    {children}
  </div>
)

/** A sidebar card of label/value rows; with no rows to show there is no card, rather than a lone title. */
export const MetadataCard = ({ title, rows }: { title: string; rows: MetadataRow[] }) =>
  rows.length === 0 ? null : (
    <SidebarCard title={title}>
      <MetadataList rows={rows} />
    </SidebarCard>
  )
