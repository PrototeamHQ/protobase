import { Button } from '../primitives/button'
import { text } from './messages'
import type { CallOutReason } from './use-call-session'

const said: Record<Exclude<CallOutReason, 'rejoin'>, 'ended' | 'removed' | 'full' | 'refused' | 'unavailable' | 'denied'> = { ended: 'ended', removed: 'removed', full: 'full', refused: 'refused', unavailable: 'unavailable', denied: 'denied' }

/** Why the member is not in the call, in plain words, and, unless they were removed or refused, a way to join again. */
export const CallMessage = ({ reason, onJoinAgain }: { reason: CallOutReason; onJoinAgain?: () => void }) => (
  <section role="status" className="flex size-full min-h-0 flex-col items-center justify-center gap-3 bg-background p-4 text-center">
    <p className="text-sm text-foreground">{text(reason === 'rejoin' ? 'ended' : said[reason])}</p>
    {onJoinAgain && reason !== 'removed' && reason !== 'refused' && reason !== 'denied' && <Button onClick={onJoinAgain}>{text('callAgain')}</Button>}
  </section>
)
