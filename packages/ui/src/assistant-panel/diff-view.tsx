import { cn } from '../lib/cn'
import { parseDiff } from './diff'

const row = { add: 'bg-success-soft text-success-text', del: 'bg-danger-soft text-danger-text', ctx: 'text-muted-foreground' }
const marker = { add: '+', del: '−', ctx: '' }

export const DiffView = ({ source, start }: { source: string; start?: number }) => (
  <pre className="overflow-x-auto bg-background py-1 font-mono text-[11px] leading-[18px]">
    {parseDiff(source, start).map((line, index) => (
      <div key={index} className={cn('flex px-0', row[line.kind])}>
        <span className="w-8 shrink-0 select-none pr-2 text-right opacity-60">{line.newNo ?? line.oldNo}</span>
        <span className="w-3 shrink-0 select-none">{marker[line.kind]}</span>
        <span className="whitespace-pre-wrap break-words pr-3 min-w-0">{line.text}</span>
      </div>
    ))}
  </pre>
)
