import type { CallLeftReason } from '@protobase/client/calls'
import { Button } from '../primitives/button'
import { text } from './messages'

const said: Record<Exclude<CallLeftReason, 'rejoin'>, Parameters<typeof text>[0]> = { ended: 'ended', removed: 'removed', full: 'full', refused: 'refused', unavailable: 'unavailable' }

/** Why the member is not in the call, in plain words, and, unless they were removed, a way to join again. */
export const CallMessage = ({ reason, onJoinAgain }: { reason: CallLeftReason; onJoinAgain?: () => void }) => (
  <section role="status" className="flex size-full min-h-0 flex-col items-center justify-center gap-3 bg-background p-4 text-center">
    <p className="text-sm text-foreground">{text(reason === 'rejoin' ? 'ended' : said[reason])}</p>
    {onJoinAgain && reason !== 'removed' && reason !== 'refused' && <Button onClick={onJoinAgain}>{text('callAgain')}</Button>}
  </section>
)
