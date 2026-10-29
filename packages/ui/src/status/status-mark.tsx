import { CircleMinus, Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { heldStatus, type PersonStatus } from '@protobase/schema/internal'
import { cn } from '../lib/cn'
import { text } from './messages'

export type StatusMarkProps = {
  /** The person's status, as `useMembers()` or `client.status` gives it; nothing shows once its clear time has passed. */
  status?: Pick<PersonStatus, 'availability' | 'text' | 'clearsAt'> | null | undefined
  /** The app's own mark, such as its online or away dot from its presence, drawn first. */
  presence?: ReactNode
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
 * A person's status beside their name: the app's `presence` mark first, then a mark for busy or do not disturb, then
 * the custom text, as text and never HTML, cut short with an ellipsis and in full on hover. Draws only `presence` when
 * the person has no status that holds now.
 */
export const StatusMark = ({ status, presence, textShown = 'full', className }: StatusMarkProps) => {
  const held = heldStatus(status)
  if (!held && !presence) return null
  const words = held?.text ?? undefined
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-muted-foreground', className)} title={words}>
      {presence}
      {held && <AvailabilityMark availability={held.availability} {...(textShown === 'hover' && words && { title: words })} />}
      {held && textShown === 'hover' && held.availability === 'automatic' && words && <span role="img" aria-label={words} className="size-1.5 shrink-0 rounded-full bg-faint-foreground" />}
      {words && textShown === 'full' && <span className="truncate text-xs">{words}</span>}
    </span>
  )
}
