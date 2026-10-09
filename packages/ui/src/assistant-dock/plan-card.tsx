import { AlertTriangle, GitBranch, ListChecks } from 'lucide-react'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { approval, approveLabel, formatCredits, waitingText, type Plan } from './model'

export type PlanCardProps = {
  plan: Plan
  balance: number
  onApprove?: (taskId: string) => void
  /** Asks for the next revision; the dock moves to the chat box for what should change. */
  onRequestChanges?: (taskId: string) => void
  onCancel?: (taskId: string) => void
  /** A free re-plan from the moved branch. */
  onUpdatePlan?: (taskId: string) => void
}

const statusNote = {
  awaiting: undefined,
  approved: 'Approved. The credits are held until the change is live.',
  canceled: 'Canceled. The 1-credit deposit was kept.',
  superseded: 'Replaced by a newer plan.',
  dropped: 'The repository changed, so this plan was dropped and the deposit refunded.',
}

export const PlanCard = ({ plan, balance, onApprove, onRequestChanges, onCancel, onUpdatePlan }: PlanCardProps) => {
  const approve = approval(plan, balance)
  const awaiting = plan.status === 'awaiting'
  const waiting = awaiting ? waitingText(plan.waiting) : undefined
  return (
    <section aria-label={`Plan, revision ${plan.revision}`} className="shrink-0 overflow-hidden rounded-lg border border-primary-border bg-background shadow-sm">
      <header className="flex items-center gap-2 bg-primary-soft px-3 py-2">
        <ListChecks className="size-3.5 text-primary-text" />
        <h3 className="flex-1 text-[13px] font-semibold text-primary-text">Plan{plan.revision > 1 && `, revision ${plan.revision}`}</h3>
        <Badge tone="blue" dot={false}>Size {plan.size}</Badge>
        <span className="text-xs font-medium text-primary-text">{formatCredits(plan.credits)}</span>
      </header>
      <div className="space-y-2.5 px-3 py-2.5">
        <p className="text-[13px]">{plan.summary}</p>
        {plan.steps.length > 0 && (
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            {plan.steps.map((step) => <li key={step.title}>{step.title}</li>)}
          </ol>
        )}
        {plan.migrations.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold">Database changes</div>
            <ul className="space-y-1">
              {plan.migrations.map((migration) => (
                <li key={migration.description} className="flex items-start gap-2 text-xs">
                  <span className="min-w-0 flex-1">{migration.description}</span>
                  {migration.destructive && <Badge tone="red">Destructive</Badge>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {plan.risks.length > 0 && (
          <ul className="space-y-1">
            {plan.risks.map((risk) => (
              <li key={risk} className="flex items-start gap-2 text-xs text-warning-text">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                {risk}
              </li>
            ))}
          </ul>
        )}
        {awaiting && plan.outdated && (
          <p role="status" className="flex items-start gap-2 rounded-md bg-warning-soft px-2.5 py-2 text-xs text-warning-text">
            <GitBranch className="mt-0.5 size-3 shrink-0" />
            The branch moved on GitHub since this plan was made. Approving runs it on the new code.
          </p>
        )}
        {waiting && <p className="text-xs text-muted-foreground">{waiting} Cancel frees the queue.</p>}
        {statusNote[plan.status] && <p className="text-xs text-muted-foreground">{statusNote[plan.status]}</p>}
        {awaiting && (
          <div className="space-y-2 pt-0.5">
            <Button variant="primary" className="w-full" disabled={!approve.enabled} onClick={() => onApprove?.(plan.taskId)}>
              {approveLabel(plan)}
            </Button>
            {approve.reason && <p className="text-xs text-danger-text">{approve.reason}</p>}
            <div className="flex gap-2">
              {plan.outdated && <Button size="sm" className="flex-1" onClick={() => onUpdatePlan?.(plan.taskId)}>Update plan</Button>}
              <Button size="sm" className="flex-1" onClick={() => onRequestChanges?.(plan.taskId)}>Ask for changes</Button>
              <Button size="sm" variant="ghost" onClick={() => onCancel?.(plan.taskId)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
