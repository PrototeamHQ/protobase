import { FileCode2 } from 'lucide-react'
import { cn } from '../lib/cn'
import { diffStats, parseDiff, splitRows, type DiffLine } from './diff'

const row = { add: 'bg-success-soft text-success-text', del: 'bg-danger-soft text-danger-text', ctx: 'text-muted-foreground', hunk: 'bg-surface text-faint-foreground' }
const marker = { add: '+', del: '−', ctx: '', hunk: '' }
const lineClasses = 'bg-background py-1 font-mono text-[0.6875rem] leading-[18px]'

export type DiffViewProps = {
  /**
   * Lines starting with `+` were added, with `-` removed; anything else is context. Or lines already read, such as one
   * file of `parsePatch`, its hunks' `@@` lines between them.
   */
  source: string | DiffLine[]
  /** The number of the first line of `source` text. */
  start?: number
  /** Shown above the lines with the counts of added and removed ones. */
  path?: string
  /** Old and new side by side from the md breakpoint up; one column below it. */
  split?: boolean
  className?: string
}

// One line in a column: its number, its mark, its text; an empty cell beside a line the other side has alone
const Line = ({ line }: { line: DiffLine | undefined }) => (
  <div className={cn('flex min-w-0', line ? row[line.kind] : 'bg-surface')}>
    <span className="w-8 shrink-0 select-none pr-2 text-right opacity-60">{line?.newNo ?? line?.oldNo}</span>
    <span className="w-3 shrink-0 select-none">{line && marker[line.kind]}</span>
    <span className="min-w-0 whitespace-pre-wrap break-words pr-3">{line?.text}</span>
  </div>
)

// The old line's number on the left of a side-by-side row
const OldLine = ({ line }: { line: DiffLine | undefined }) => <Line line={line && line.kind === 'ctx' ? { ...line, newNo: undefined } : line} />

const Unified = ({ lines, className }: { lines: DiffLine[]; className?: string }) => (
  <pre className={cn('overflow-x-auto', lineClasses, className)}>
    {lines.map((line, index) => (
      <Line key={index} line={line} />
    ))}
  </pre>
)

const Split = ({ lines, className }: { lines: DiffLine[]; className?: string }) => (
  <pre className={cn('grid-cols-2', lineClasses, className)}>
    {splitRows(lines).map((split, index) =>
      split.kind === 'hunk' ? (
        <div key={index} className={cn('col-span-2 px-3', row.hunk)}>
          {split.text}
        </div>
      ) : (
        <div key={index} className="contents">
          <OldLine line={split.old} />
          <Line line={split.new} />
        </div>
      ),
    )}
  </pre>
)

/** Changed lines of one file, numbered, with added and removed lines marked. */
export const DiffView = ({ source, start, path, split, className }: DiffViewProps) => {
  const lines = typeof source === 'string' ? parseDiff(source, start) : source
  const stats = diffStats(lines)
  return (
    <div className={cn('overflow-hidden', className)}>
      {path && (
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
          <FileCode2 className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] text-foreground">{path}</span>
          <span className="text-[0.6875rem] font-medium text-success-text">+{stats.added}</span>
          {stats.removed > 0 && <span className="text-[0.6875rem] font-medium text-danger-text">{'−'}{stats.removed}</span>}
        </div>
      )}
      {lines.length > 0 && !split && <Unified lines={lines} />}
      {lines.length > 0 && split && (
        <>
          <Unified lines={lines} className="md:hidden" />
          <Split lines={lines} className="hidden md:grid" />
        </>
      )}
    </div>
  )
}
