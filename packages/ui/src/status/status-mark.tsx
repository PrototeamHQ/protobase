import { CircleMinus, Clock } from 'lucide-react'
import { heldStatus, type PersonStatus } from '@protobase/schema/internal'
import { cn } from '../lib/cn'
import type { Presence } from '../presence/presence'
import { PresenceDot } from '../presence/presence-dot'
import { text } from './messages'

export type StatusMarkProps = {
  /** The person's status, as `useMembers()` or `client.status` gives it; nothing shows once its clear time has passed. */
  status?: Pick<PersonStatus, 'availability' | 'text' | 'clearsAt'> | null | undefined
  /** Whether the person is online or away, from the app's presence (see `usePresence`), drawn first as a dot; none without. */
  presence?: Presence | null | undefined
  /** The custom text in `full`, or only on `hover` of the mark, as a tooltip; default `full`. */
  textShown?: 'full' | 'hover'
  className?: string
}

/** An availability's name, as the picker offers it. */
export const availabilityLabel = (availability: PersonStatus['availability']) => text(availability === 'busy' ? 'busy' : availability === 'do_not_disturb' ? 'doNotDisturb' : 'automatic')

/** The mark of busy or do not disturb, with its name for screen readers and on hover. */
export const AvailabilityMark = ({ availability, title }: { availability: PersonStatus['availability']; title?: string }) => {
  if (availability === 'automatic') return null
  const label = availabilityLabel(availability)
  const Icon = availability === 'busy' ? Clock : CircleMinus
  return <Icon role="img" aria-label={label} className={cn('size-3.5 shrink-0', availability === 'busy' ? 'text-warning' : 'text-danger')}><title>{title ?? label}</title></Icon>
}

/**
 * A person's status beside their name: their `presence` dot first, then a mark for busy or do not disturb, then
 * the custom text, as text and never HTML, cut short with an ellipsis and in full on hover. Draws only `presence` when
 * the person has no status that holds now.
 */
export const StatusMark = ({ status, presence, textShown = 'full', className }: StatusMarkProps) => {
  const held = heldStatus(status)
  if (!held && !presence) return null
  const words = held?.text ?? undefined
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-muted-foreground', className)} title={words}>
      {presence && <PresenceDot presence={presence} />}
      {held && <AvailabilityMark availability={held.availability} {...(textShown === 'hover' && words && { title: words })} />}
      {held && textShown === 'hover' && held.availability === 'automatic' && words && <span role="img" aria-label={words} className="size-1.5 shrink-0 rounded-full bg-faint-foreground" />}
      {words && textShown === 'full' && <span className="truncate text-xs">{words}</span>}
    </span>
  )
}
