import type { ActionRun, AppAddress } from '@protobase/schema'
import { fillAddress } from '@protobase/schema/internal'
import type { RouteTarget } from '../../primitives/route-link'
import { linkTarget } from './action-href'

type LinkRun = Extract<ActionRun, { kind: 'link' }>

/** How the app writes and follows an address, as `useAppAddress` gives them. */
type Addresses = { href: (to: AppAddress) => string; go: (to: AppAddress) => void }

/**
 * A link action on `record` as a link: an address in the app is followed in place, a page outside it, an `https:` or
 * `http:` one in a new tab, is left to the browser. A link whose `href` has no target on the record is never shown
 * (`actionFor` leaves it out), so asking for it is a mistake.
 */
export const actionLink = (run: LinkRun, record: Record<string, unknown> | undefined, { href, go }: Addresses): RouteTarget => {
  if ('to' in run) {
    const to = fillAddress(run.to, record)
    return { href: href(to), onFollow: () => go(to) }
  }
  const target = linkTarget(run.href, record)
  if (target === undefined) throw new Error('A link action without a target on the record is not shown')
  return { href: target, newTab: /^https?:/i.test(target) }
}
