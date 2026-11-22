import type { StatusTone } from '@protobase/schema'
import { StatusDot } from '../app-shell/status-dot'
import { text } from '../status/messages'
import type { Presence } from './presence'

// Online a filled dot, away a triangle, offline an empty ring: each its own shape, not its colour alone.
const tone = { online: 'success', away: 'warning', offline: 'neutral' } satisfies Record<Presence, StatusTone>

/** Online, away or offline as a dot, named for screen readers and on hover. */
export const PresenceDot = ({ presence }: { presence: Presence }) => {
  const label = text(presence)
  return (
    <span role="img" aria-label={label} title={label} className="flex shrink-0">
      <StatusDot tone={tone[presence]} />
    </span>
  )
}
