import { Check, Minus } from 'lucide-react'
import { cn } from '../lib/cn'

export type CheckboxProps = { checked: boolean; indeterminate?: boolean; onChange?: (checked: boolean) => void; label?: string; disabled?: boolean; className?: string }

export const Checkbox = ({ checked, indeterminate, onChange, label, disabled, className }: CheckboxProps) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={indeterminate ? 'mixed' : checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange?.(!checked)}
    className={cn(
      'relative inline-flex size-4 shrink-0 items-center justify-center rounded border transition-colors after:absolute after:-inset-1 after:content-[""] pointer-coarse:after:-inset-3.5',
      checked || indeterminate ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong bg-background hover:border-faint-foreground',
      className,
    )}
  >
    {indeterminate ? <Minus className="size-3" strokeWidth={3} /> : checked && <Check className="size-3" strokeWidth={3} />}
  </button>
)
