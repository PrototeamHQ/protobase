import { RouteLink, type RouteTarget } from '../primitives/route-link'
import { Spinner } from '../primitives/spinner'
import { text } from './messages'

/** A guest's wait in the lobby, until someone in the call lets them in, with Leave. */
export const CallWaiting = ({ leave }: { leave: RouteTarget }) => (
  <section role="status" className="flex size-full min-h-0 flex-col items-center justify-center gap-3 bg-background p-4 text-center">
    <p className="flex items-center gap-2 text-sm text-foreground">
      <Spinner className="size-4" />
      {text('waiting')}
    </p>
    <RouteLink to={leave} className="px-2 text-sm text-muted-foreground hover:text-foreground">
      {text('leave')}
    </RouteLink>
  </section>
)
