import { Check, RotateCcw, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { Badge } from '../primitives/badge'
import { Spinner } from '../primitives/spinner'
import type { Check as CheckItem } from './content'

const icons = {
  passed: <Check className="size-3.5 text-success" strokeWidth={2.5} />,
  failed: <X className="size-3.5 text-danger" strokeWidth={2.5} />,
  running: <Spinner className="size-3.5 text-primary" />,
}

export const ChecksList = ({ checks }: { checks: CheckItem[] }) => (
  <div className="shrink-0 divide-y divide-border rounded-lg border border-border-strong bg-background shadow-sm">
    <div className="px-3 py-2 text-xs font-semibold text-foreground">Checks</div>
    {checks.map((check) => (
      <div key={check.label} className={cn('flex items-start gap-2.5 px-3 py-2', check.retry && 'bg-surface pl-6')}>
        <span className="mt-0.5 flex size-4 items-center justify-center">{check.retry ? <RotateCcw className="size-3.5 text-muted-foreground" /> : icons[check.state]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            {check.label}
            {check.retry && <Badge tone="violet" dot={false}>free retry</Badge>}
          </div>
          <div className={cn('truncate text-xs', check.state === 'failed' ? 'text-danger-text' : 'text-muted-foreground')}>{check.detail}</div>
        </div>
        {check.retry && <span className="mt-0.5">{icons[check.state]}</span>}
      </div>
    ))}
  </div>
)
