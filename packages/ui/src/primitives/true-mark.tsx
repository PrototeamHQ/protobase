import { Check } from 'lucide-react'
import { cn } from '../lib/cn'

/** The green check a true boolean shows as, in a table cell and a `BooleanField`; `label` is its word for screen readers. */
export const TrueMark = ({ label, className }: { label?: string; className?: string }) => (
  <span role={label === undefined ? undefined : 'img'} aria-label={label} title={label} className={cn('inline-flex size-4 items-center justify-center rounded-full bg-success-soft text-success-text', className)}>
    <Check className="size-3" strokeWidth={3} />
  </span>
)
