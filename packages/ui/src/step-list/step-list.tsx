import { Check, Circle, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { Spinner } from '../primitives/spinner'

export type StepState = 'pending' | 'running' | 'done' | 'failed'
export type Step = { label: string; state: StepState }

const icons = {
  pending: <Circle className="size-3 text-faint-foreground" />,
  running: <Spinner className="size-3.5 text-primary" />,
  done: <Check className="size-3.5 text-success" strokeWidth={2.5} />,
  failed: <X className="size-3.5 text-danger" strokeWidth={2.5} />,
}

const tones = { pending: 'text-muted-foreground', running: 'text-foreground', done: 'text-muted-foreground', failed: 'text-danger-text' }

/** Steps of a longer piece of work, each pending, running, done or failed. */
export const StepList = ({ steps, className }: { steps: Step[]; className?: string }) => (
  <ul className={cn('shrink-0 space-y-2', className)}>
    {steps.map((step, index) => (
      <li key={`${index}-${step.label}`} className="flex items-start gap-2.5 text-[13px]" data-state={step.state}>
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">{icons[step.state]}</span>
        <span className={tones[step.state]}>{step.label}</span>
      </li>
    ))}
  </ul>
)
