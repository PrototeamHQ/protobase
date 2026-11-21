import type { AppAddress } from '@protobase/schema'
import { formatDateTime } from '../../format/date'
import { buttonClass } from '../../primitives/button'
import { AppLink } from '../use-app-address'
import { lastReplyLabel } from './reply-labels'
import { text } from './messages'

type Props = { count: number; last: string | undefined; to: AppAddress }

/** Under a thread's first message in the conversation: its number of replies, a link that opens the thread, and when the last one came. */
export const ThreadSummary = ({ count, last, to }: Props) => (
  <div className="flex items-center gap-2 whitespace-normal">
    <AppLink to={to} className={`${buttonClass({ variant: 'ghost', size: 'sm' })} -ml-2.5`}>
      {text('replies', { count })}
    </AppLink>
    {last !== undefined && (
      <time dateTime={last} title={formatDateTime(Date.parse(last))} className="text-xs text-muted-foreground">
        {lastReplyLabel(last)}
      </time>
    )}
  </div>
)
