import { Phone } from 'lucide-react'
import { cn } from '../lib/cn'
import { buttonClass } from '../primitives/button'
import { RouteLink } from '../primitives/route-link'
import { text } from './messages'
import { useRecordCalls } from './use-record-calls'
import { useRecordCallAddress } from './use-record-call-address'

export type CallMarkProps = { resource: string; recordKey: string; className?: string }

/**
 * A record's call, for the app to place where it wants, such as a conversation's header: Start call while there is
 * none, and "Call in progress · 3 · Join" while one goes on, live. Start call and Join are links to the record's page
 * that joins its call (`call=join`); on that page itself, Join is left out.
 */
export const CallMark = ({ resource, recordKey, className }: CallMarkProps) => {
  const { ongoing, isPending } = useRecordCalls(resource, recordKey)
  const { joining, join } = useRecordCallAddress(resource, recordKey)
  if (isPending) return null
  if (!ongoing) {
    if (joining) return null
    return (
      <RouteLink to={join} className={cn(buttonClass({ size: 'sm' }), className)}>
        <Phone className="size-3.5" />
        {text('startCall')}
      </RouteLink>
    )
  }
  const count = ongoing.members.length
  return (
    <span role="status" className={cn('inline-flex items-center gap-1.5 rounded-md bg-success-soft px-2 py-0.5 text-body text-foreground', className)}>
      <Phone className="size-3.5 text-success" />
      {text('inProgress')}
      <span aria-hidden>·</span>
      <span aria-label={text('people', { count })}>{count}</span>
      {!joining && (
        <>
          <span aria-hidden>·</span>
          <RouteLink to={join} className={buttonClass({ variant: 'primary', size: 'sm' })}>
            {text('join')}
          </RouteLink>
        </>
      )}
    </span>
  )
}
