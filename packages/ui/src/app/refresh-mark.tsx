import { TriangleAlert } from 'lucide-react'
import { revealLate } from '../primitives/skeleton'
import { Spinner } from '../primitives/spinner'
import { Tooltip } from '../primitives/tooltip'
import { cn } from '../lib/cn'
import { text } from './messages'

/**
 * Beside the page's title while the page shows data from the start cache: a small spinner while it refreshes, blank for
 * its first 180 ms, or a warning, in the same spot, once the refresh failed and the cached data stays.
 */
export const RefreshMark = ({ failed }: { failed: boolean }) =>
  failed ? (
    <Tooltip label={text('refreshFailed')} side="bottom">
      <TriangleAlert role="img" aria-label={text('refreshFailed')} className="size-4 text-warning" />
    </Tooltip>
  ) : (
    <span role="status" aria-label={text('refreshing')} className={cn('inline-flex text-muted-foreground', revealLate)}>
      <Spinner hidden />
    </span>
  )
