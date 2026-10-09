import type { ProgressProps } from '@protobase/layout'
import { Skeleton } from '../../../primitives/skeleton'
import { useLayoutRecord } from '../record-scope'
import { usePathValue } from '../use-path-value'
import { propsOf, type BlockProps } from './block-props'

/** A number as given, or the number in a field of the record around it. */
const useAmount = (amount: number | string | undefined, fallback: number) => {
  const scope = useLayoutRecord()
  const value = usePathValue(typeof amount === 'string' ? scope : undefined, typeof amount === 'string' ? amount : '')
  if (typeof amount === 'number') return amount
  if (amount === undefined) return fallback
  if (value.state === 'ready') return Number(value.value)
  return value.state === 'loading' ? undefined : Number.NaN
}

/** A bar for `value` out of `max` (100 by default), with the numbers beside the label. */
export const ProgressBlock = ({ node }: BlockProps) => {
  const { value, max, label } = propsOf<ProgressProps>(node)
  const current = useAmount(value, 0)
  const total = useAmount(max, 100)
  if (current === undefined || total === undefined) return <Skeleton className="h-6 w-full" />
  if (!Number.isFinite(current) || !Number.isFinite(total)) return null
  const share = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {current.toLocaleString('en-IE')} / {total.toLocaleString('en-IE')}
        </span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuenow={current} aria-valuemin={0} aria-valuemax={total} className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className={share >= 0.9 ? 'h-full rounded-full bg-warning' : 'h-full rounded-full bg-primary'} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  )
}
