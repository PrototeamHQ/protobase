import type { MouseEvent } from 'react'
import { cn } from '../lib/cn'
import { CountBadge } from '../primitives/count-badge'
import type { NavRecord, RecordMark } from './nav'
import { markRecords, recordNames, type MarkedRecord } from './record-marks'
import { subRow } from './sidebar-rows'
import { StatusDot } from './status-dot'

type Mode = 'text-large' | 'text-small'

type RowsProps = { records: MarkedRecord[]; mode: Mode; onNavigate?: (href: string) => void }

// The row of each record: its status dot, its title, bold and in the foreground colour when marked strong, and its count.
const RecordRows = ({ records, mode, onNavigate }: RowsProps) =>
  records.map((record) => {
    const { ariaLabel, title } = recordNames(record)
    const open = onNavigate && ((event: MouseEvent) => { event.preventDefault(); onNavigate(record.href) })
    const strong = record.mark?.strong === true
    return (
      <li key={record.id}>
        <a
          href={record.href}
          onClick={open}
          aria-label={ariaLabel}
          title={title}
          aria-current={record.active ? 'page' : undefined}
          className={cn(
            'flex min-w-0 items-center rounded-md transition-colors',
            subRow[mode],
            strong ? 'font-bold' : 'font-medium',
            record.active || strong ? 'text-foreground' : 'text-muted-foreground',
            record.active ? 'bg-muted' : 'hover:bg-muted hover:text-foreground',
          )}
        >
          {record.status && <StatusDot tone={record.status.tone} pulse={record.status.pulse} />}
          <span className="truncate">{record.label}</span>
          <CountBadge count={record.mark?.count} className="ml-auto shrink-0" />
        </a>
      </li>
    )
  })

// Calls the group's marks hook, so only a group that has one calls it, always the same hook while it shows.
const MarkedRows = ({ records, useMarks, ...rest }: RowsProps & { useMarks: () => Record<string, RecordMark> | undefined }) => <RecordRows records={markRecords(records, useMarks())} {...rest} />

/** The rows of a sidebar group's records, marked by the group's `useMarks` hook when it has one. */
export const SidebarRecords = ({ records, useMarks, mode, onNavigate }: { records: NavRecord[]; useMarks?: () => Record<string, RecordMark> | undefined; mode: Mode; onNavigate?: (href: string) => void }) =>
  useMarks ? <MarkedRows records={records} useMarks={useMarks} mode={mode} onNavigate={onNavigate} /> : <RecordRows records={records} mode={mode} onNavigate={onNavigate} />
