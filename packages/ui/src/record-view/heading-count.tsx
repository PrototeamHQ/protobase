import { formatTag } from '../locale/active-locale'
import { cn } from '../lib/cn'
import { Badge } from '../primitives/badge'
import { Skeleton } from '../primitives/skeleton'
import { text } from './messages'

/** What a heading's records are called, to say the count aloud, such as "2 tasks"; "records" without. */
export type CountNames = { singular: string; plural: string }

type HeadingCountProps = {
  /** `undefined` while it loads, `null` when it could not be counted. */
  count: number | null | undefined
  names?: CountNames
}

/**
 * How many records a heading stands over, as a quiet pill after its title, 0 as an outline, and to a screen reader a
 * phrase such as "(2 tasks)"; a placeholder of its size while unknown, and nothing when it could not be counted.
 */
export const HeadingCount = ({ count, names }: HeadingCountProps) => {
  if (count === null) return null
  if (count === undefined) return <Skeleton className="inline-block h-5 w-7 rounded-full" />
  return (
    <>
      <Badge dot={false} className={cn('tabular-nums', count === 0 && 'bg-transparent ring-1 ring-border ring-inset')}>
        <span aria-hidden>{count.toLocaleString(formatTag())}</span>
      </Badge>
      <span className="sr-only">{names ? text('headingCount', { count, ...names }) : text('headingCountRecords', { count })}</span>
    </>
  )
}
