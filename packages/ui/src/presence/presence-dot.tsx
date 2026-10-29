import { StatusDot } from '../app-shell/status-dot'
import { text } from '../status/messages'
import type { Presence } from './presence'

/** Online or away as a dot, named for screen readers and on hover. */
export const PresenceDot = ({ presence }: { presence: Presence }) => {
  const label = text(presence)
  return (
    <span role="img" aria-label={label} title={label} className="flex shrink-0">
      <StatusDot tone={presence === 'online' ? 'success' : 'neutral'} />
    </span>
  )
}
