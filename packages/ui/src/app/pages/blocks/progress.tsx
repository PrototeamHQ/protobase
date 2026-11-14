import type { ProgressProps } from '@protobase/layout'
import { Skeleton } from '../../../primitives/skeleton'
import { frameFor, useScopeStack } from '../record-scope'
import { usePathValue } from '../use-path-value'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'
import { formatTag } from '../../../locale/active-locale'

/** A number as given, or the number in a field of the records around it. */
const useAmount = (amount: number | string | undefined, fallback: number) => {
  const stack = useScopeStack()
  const at = typeof amount === 'string' ? frameFor(stack, amount) : undefined
  const value = usePathValue(at?.frame, at?.path ?? '')
  if (typeof amount === 'number') return amount
  if (amount === undefined) return fallback
  if (value.state === 'ready') return Number(value.value)
  return value.state === 'loading' ? undefined : Number.NaN
}

/** A bar for `value` out of `max` (100 by default), with the numbers beside the label. */
export const ProgressBlock = ({ node, className }: BlockProps) => {
  const { value, max, label } = propsOf<ProgressProps>(node)
  const current = useAmount(value, 0)
  const total = useAmount(max, 100)
  if (current === undefined || total === undefined) return <Skeleton className="h-6 w-full" />
  if (!Number.isFinite(current) || !Number.isFinite(total)) return null
  const share = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-2 text-body">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {current.toLocaleString(formatTag())} / {total.toLocaleString(formatTag())}
        </span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuenow={current} aria-valuemin={0} aria-valuemax={total} className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className={share >= 0.9 ? 'h-full rounded-full bg-warning' : 'h-full rounded-full bg-primary'} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  )
}
