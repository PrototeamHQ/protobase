import { cn } from '../lib/cn'
import { text } from './messages'

/** The end of a chat while the other side writes a reply: three pulsing dots, read out as "Writing a reply…". */
export const ChatWorking = ({ className }: { className?: string }) => (
  <div role="status" data-chat-working className={cn('flex h-5 shrink-0 items-center gap-1 pl-11', className)}>
    {/* Each dot pulses a little after the one before it; asked for less motion, they stay still */}
    {[0, 200, 400].map((delay) => (
      <span key={delay} className="size-1.5 rounded-full bg-muted-foreground [animation:pb-shimmer_1.2s_ease-in-out_infinite]" style={{ animationDelay: `${delay}ms` }} />
    ))}
    <span className="sr-only">{text('working')}</span>
  </div>
)
