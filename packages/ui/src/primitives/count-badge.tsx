import { cn } from '../lib/cn'
import { Badge } from './badge'

// Counts above this show as 99+
const shownMax = 99

/** A count as its badge shows it: up to 99, then 99+; none while it is zero or unknown. */
export const countBadgeText = (count: number | undefined) => (count === undefined || count <= 0 ? undefined : count > shownMax ? `${shownMax}+` : String(count))

/** The small red pill with a count of unread things, such as over the notification bell; nothing while the count is zero. */
export const CountBadge = ({ count, className }: { count: number | undefined; className?: string }) => {
  const shown = countBadgeText(count)
  if (!shown) return null
  return (
    <Badge tone="red" dot={false} className={cn('h-4 min-w-4 justify-center px-1 text-[10px] font-semibold', className)}>
      {shown}
    </Badge>
  )
}
