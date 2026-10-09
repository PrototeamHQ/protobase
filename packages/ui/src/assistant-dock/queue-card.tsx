import { Clock } from 'lucide-react'
import { Button } from '../primitives/button'
import { queueText } from './model'

export type QueueCardProps = {
  taskId: string
  request: string
  ahead: number
  waitingOnPlan: boolean
  /** No planning ran yet, so the deposit is refunded. */
  onCancel?: (taskId: string) => void
}

/** A task waiting in the app's queue, with its deposit billed. */
export const QueueCard = ({ taskId, request, ahead, waitingOnPlan, onCancel }: QueueCardProps) => (
  <section aria-label="Queued change" className="flex shrink-0 items-start gap-2.5 rounded-lg border border-border-strong bg-background px-3 py-2.5 shadow-sm">
    <Clock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1 space-y-0.5">
      <div className="truncate text-[13px] font-medium">{request}</div>
      <div className="text-xs text-muted-foreground">{queueText(ahead, waitingOnPlan)}</div>
    </div>
    <Button variant="ghost" size="sm" onClick={() => onCancel?.(taskId)}>Cancel</Button>
  </section>
)
