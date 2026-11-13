import { TriangleAlert } from 'lucide-react'
import { revealLate } from '../primitives/skeleton'
import { Spinner } from '../primitives/spinner'
import { Tooltip } from '../primitives/tooltip'
import { text } from './messages'

/**
 * Beside the page's title while the page shows data from the start cache: a small spinner while it refreshes, blank for
 * its first 180 ms, or a warning, in the same spot, once the refresh failed and the cached data stays. One status region
 * says which, so a screen reader hears when the refresh failed.
 */
export const RefreshMark = ({ failed }: { failed: boolean }) => (
  <span className="inline-flex items-center text-muted-foreground">
    <span role="status" className="sr-only">
      {failed ? text('refreshFailed') : text('refreshing')}
    </span>
    {failed ? (
      <Tooltip label={text('refreshFailed')} side="bottom">
        <TriangleAlert aria-hidden className="size-4 text-warning" />
      </Tooltip>
    ) : (
      <span className={revealLate}>
        <Spinner hidden />
      </span>
    )}
  </span>
)
