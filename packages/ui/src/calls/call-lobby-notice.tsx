import type { CallGuests, CallLobbyGuest } from '@protobase/client/calls'
import { Button } from '../primitives/button'
import { text } from './messages'
import { useGuestRequest } from './use-guest-request'

/** Who waits first in the lobby, with Let in and Turn away, so a member sees it without opening the guests. */
export const CallLobbyNotice = ({ waiting, guests }: { waiting: CallLobbyGuest[]; guests: CallGuests }) => {
  const { run, refused } = useGuestRequest()
  const first = waiting[0]
  if (!first) return null
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 rounded-md bg-primary-soft px-3 py-1.5 text-xs text-foreground">
      <span className="min-w-0 flex-1 truncate">{refused ? text('guestRefused') : text('waitingGuest', { name: first.name })}</span>
      <Button size="sm" variant="primary" onClick={() => run(() => guests.admit(first.guest))}>
        {text('admit')}
      </Button>
      <Button size="sm" onClick={() => run(() => guests.deny(first.guest))}>
        {text('deny')}
      </Button>
    </div>
  )
}
