import type { ReactNode } from 'react'
import { hueOf, initialsOf } from '../auth/user-to-shell'
import { formatDateTime, formatTime } from '../format/date'
import { cn } from '../lib/cn'
import { Avatar } from '../primitives/avatar'

/** Who wrote a message of a chat between people: `id` gives their avatar its colour, `name` its initials. */
export type ChatAuthor = { id: string; name?: string }

type Common = {
  children: ReactNode
  /** A small line under the message, such as whether it was read. */
  footer?: ReactNode
}

export type ChatMessageProps = Common &
  (
    | {
        /** An assistant chat's side: the user's message as a bubble on the right, the other side's as plain content. */
        from: 'user' | 'assistant'
        author?: never
      }
    | {
        /** A chat between people: the message on the left under its author's name and time, beside their avatar. */
        author: ChatAuthor
        from?: never
        /** When it was sent, as an ISO timestamp, shown as the time of day. */
        time?: string
        /** Drawn instead of the author's initials, such as their photo. */
        avatar?: ReactNode
        /** It follows a message by the same author, so it leaves out their avatar, name and time. */
        continued?: boolean
      }
  )

const Footer = ({ children, className }: { children: ReactNode; className?: string }) => <p className={cn('text-xs text-muted-foreground', className)}>{children}</p>

const Sent = ({ time }: { time: string }) => {
  const at = Date.parse(time)
  return (
    <time dateTime={time} title={formatDateTime(at)} className="text-xs text-muted-foreground">
      {formatTime(at)}
    </time>
  )
}

/** One message of a chat, cards included: an assistant chat's user or assistant side, or a person's message with `author`. */
export const ChatMessage = (props: ChatMessageProps) => {
  const { children, footer } = props
  if (props.author) {
    const { author, time, avatar, continued } = props
    const name = author.name ?? author.id
    return (
      <div data-from="person" className={cn('flex min-w-0 gap-3', continued && '-mt-3')}>
        <div className="w-8 shrink-0">{!continued && (avatar ?? <Avatar initials={initialsOf(name) || '?'} hue={hueOf(author.id)} size="md" className="ring-0" />)}</div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {!continued && (
            <p className="flex items-baseline gap-2">
              <span className="font-medium text-foreground">{name}</span>
              {time && <Sent time={time} />}
            </p>
          )}
          <div className="flex min-w-0 flex-col gap-2 whitespace-pre-wrap break-words text-foreground">{children}</div>
          {footer && <Footer>{footer}</Footer>}
        </div>
      </div>
    )
  }
  const bubble = (
    <div
      data-from={props.from}
      className={cn(
        'flex min-w-0 flex-col gap-2 whitespace-pre-wrap break-words',
        props.from === 'user' ? 'ml-8 self-end rounded-lg rounded-br-sm bg-primary px-3 py-2 text-primary-foreground shadow-sm' : 'mr-4 text-foreground',
      )}
    >
      {children}
    </div>
  )
  if (!footer) return bubble
  // The footer sits under the bubble, on its side
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', props.from === 'user' && 'items-end')}>
      {bubble}
      <Footer className={props.from === 'user' ? 'text-right' : undefined}>{footer}</Footer>
    </div>
  )
}
