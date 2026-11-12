import { text } from './messages'

/**
 * Where a chat says the other side writes a reply: while `working`, three pulsing dots and "Writing a reply…". The
 * region stays while idle, so a screen reader announces the text when it fills.
 */
export const ChatWorking = ({ working }: { working: boolean }) => (
  <div role="status" className="shrink-0 pl-11">
    {working && (
      <p data-chat-working className="flex items-center gap-2 text-xs text-muted-foreground">
        {/* Each dot pulses a little after the one before it; asked for less motion, they stay still */}
        <span aria-hidden className="flex gap-1">
          {[0, 200, 400].map((delay) => (
            <span key={delay} className="size-1.5 rounded-full bg-muted-foreground [animation:pb-shimmer_1.2s_ease-in-out_infinite]" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
        {text('working')}
      </p>
    )}
  </div>
)
