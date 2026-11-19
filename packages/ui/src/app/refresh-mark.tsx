import { QueryClientContext } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useContext, useState } from 'react'
import { revealLate } from '../primitives/skeleton'
import { Spinner } from '../primitives/spinner'
import { Button } from '../primitives/button'
import { ResponsiveDialog } from '../primitives/responsive-dialog'
import { ClientStartContext, isRestored } from '../data/start-cache/restored-state'
import { text } from './messages'

/**
 * Beside the page's title while the page shows data from the start cache: a small spinner while it refreshes, blank for
 * its first 180 ms, or a warning, in the same spot, once the refresh failed and the cached data stays. One status region
 * says which, so a screen reader hears when the refresh failed. It is the one thing a refresh shows: the page itself
 * stays as it was drawn (`data-fetching` names it so).
 */
export const RefreshMark = ({ failed }: { failed: boolean }) => (
  <span data-fetching className="inline-flex items-center text-muted-foreground">
    <span role="status" className="sr-only">
      {failed ? text('refreshFailed') : text('refreshing')}
    </span>
    {failed ? (
      <RefreshFailed />
    ) : (
      <span className={revealLate}>
        <Spinner hidden />
      </span>
    )}
  </span>
)

/**
 * The warning: a button, 44 points to tap, that says in plain words why the page shows what the app last loaded, with
 * a retry that fetches the page's cached answers again.
 */
const RefreshFailed = () => {
  const [open, setOpen] = useState(false)
  // Without a query client, as in a story, there is nothing to fetch again
  const client = useContext(QueryClientContext)
  const startedAt = useContext(ClientStartContext)
  const retry = () => {
    setOpen(false)
    void client?.refetchQueries({ type: 'active', predicate: (query) => isRestored(query.state, startedAt) })
  }
  return (
    <>
      <button type="button" aria-label={text('refreshWhy')} onClick={() => setOpen(true)} className="-m-3 inline-flex size-11 items-center justify-center rounded-md md:-m-1 md:size-7">
        <TriangleAlert aria-hidden className="size-4 text-warning" />
      </button>
      <ResponsiveDialog
        title={text('refreshFailedTitle')}
        description={text('refreshFailedHelp')}
        open={open}
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button onClick={() => setOpen(false)}>{text('refreshClose')}</Button>
            <Button variant="primary" onClick={retry}>
              {text('refreshRetry')}
            </Button>
          </>
        }
      />
    </>
  )
}
