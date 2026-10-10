import { FileCode2 } from 'lucide-react'
import { cn } from '../lib/cn'
import { diffStats, parseDiff } from './diff'

const row = { add: 'bg-success-soft text-success-text', del: 'bg-danger-soft text-danger-text', ctx: 'text-muted-foreground' }
const marker = { add: '+', del: '−', ctx: '' }

export type DiffViewProps = {
  /** Lines starting with `+` were added, with `-` removed; anything else is context. */
  source: string
  /** The number of the first line. */
  start?: number
  /** Shown above the lines with the counts of added and removed ones. */
  path?: string
  className?: string
}

/** Changed lines of one file, numbered, with added and removed lines marked. */
export const DiffView = ({ source, start, path, className }: DiffViewProps) => {
  const lines = parseDiff(source, start)
  const stats = diffStats(lines)
  return (
    <div className={cn('overflow-hidden', className)}>
      {path && (
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
          <FileCode2 className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{path}</span>
          <span className="text-[11px] font-medium text-success-text">+{stats.added}</span>
          {stats.removed > 0 && <span className="text-[11px] font-medium text-danger-text">{'−'}{stats.removed}</span>}
        </div>
      )}
      <pre className="overflow-x-auto bg-background py-1 font-mono text-[11px] leading-[18px]">
        {lines.map((line, index) => (
          <div key={index} className={cn('flex', row[line.kind])}>
            <span className="w-8 shrink-0 select-none pr-2 text-right opacity-60">{line.newNo ?? line.oldNo}</span>
            <span className="w-3 shrink-0 select-none">{marker[line.kind]}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words pr-3">{line.text}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}
