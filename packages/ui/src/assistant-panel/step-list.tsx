import { Check, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { Spinner } from '../primitives/spinner'
import type { Step } from './content'

export const StepList = ({ steps }: { steps: Step[] }) => (
  <ul className="shrink-0 space-y-2">
    {steps.map((step) => (
      <li key={step.label} className="flex items-start gap-2.5 text-[13px]">
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
          {step.state === 'running' && <Spinner className="size-3.5 text-primary" />}
          {step.state === 'done' && <Check className="size-3.5 text-success" strokeWidth={2.5} />}
          {step.state === 'failed' && <X className="size-3.5 text-danger" strokeWidth={2.5} />}
        </span>
        <span className={cn(step.state === 'running' ? 'text-foreground' : 'text-muted-foreground', step.state === 'failed' && 'text-danger-text')}>{step.label}</span>
      </li>
    ))}
  </ul>
)
