import { BellOff, BellRing } from 'lucide-react'
import type { PushFailure } from '../push/push-failure'
import type { PushState } from '../push/web-push'
import { Button } from '../../primitives/button'
import { text } from './messages'
import { pushFailureText } from './push-failure-text'

export type PushControlProps = {
  state: PushState | 'loading'
  /** Turning push on or off is under way: the button spins and cannot be pressed again. */
  busy?: boolean
  /** Why turning push on last failed, said in place of the offer, with a way to try again. */
  failure?: PushFailure | undefined
  /** Called straight from the button's click, as turning push on must be. */
  onTurnOn: () => void
  onTurnOff: () => void
}

/**
 * Push for this device at the foot of the panel: an offer to turn it on, or why turning it on failed, that it is on
 * with a way to turn it off, or that the browser blocks it and how to allow it. Nothing while it is not known yet, or
 * where this device cannot get it.
 */
export const PushControl = ({ state, busy = false, failure, onTurnOn, onTurnOff }: PushControlProps) => {
  if (state === 'loading' || state === 'unsupported') return null
  if (state === 'blocked') {
    return (
      <p className="flex gap-2 border-t px-3 py-2.5 text-xs text-muted-foreground">
        <BellOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {text('pushBlocked')}
      </p>
    )
  }
  const on = state === 'on'
  const failed = !on && failure
  return (
    <div className="flex items-center gap-2 border-t px-3 py-2.5 text-xs text-muted-foreground">
      <BellRing className="size-3.5 shrink-0" aria-hidden />
      {failed ? (
        <span role="alert" className="min-w-0 flex-1 text-danger-text">
          {pushFailureText(failed)}
        </span>
      ) : (
        <span className="min-w-0 flex-1">{text(on ? 'pushOn' : 'pushOff')}</span>
      )}
      <Button size="sm" variant={on ? 'secondary' : 'primary'} loading={busy} onClick={on ? onTurnOff : onTurnOn}>
        {text(on ? 'turnOff' : failed ? 'tryAgain' : 'turnOn')}
      </Button>
    </div>
  )
}
