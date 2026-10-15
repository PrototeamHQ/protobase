import { useCallback, useMemo } from 'react'
import { readSignInAddress, signInPath, type SignInStep } from '@protobase/schema'
import { useRouter } from '../app/router'
import { withoutSignInLink } from './provider-link'

/**
 * The sign-in route as logical values, and the ways to move along it: `address` is the step it shows, or `undefined` on
 * any other page; `next` is the page to come back to; `open` shows a step, `link` is a step for a `RouteLink`, which a
 * click opens, and `leave` goes back to `next` in place of the route in the tab's history. Components read and write
 * the sign-in route through this hook, never its query.
 */
export const useSignInAddress = () => {
  const { path, params, basePath, navigate } = useRouter()
  const address = useMemo(() => readSignInAddress(path, params), [path, params])
  // Off the route, the page to come back to is this one, without a sign-in link's marker or a provider's error: coming
  // back to them would start that sign-in again, or show its error again.
  const here = withoutSignInLink(new URL(params.size > 0 ? `${path}?${params}` : path, 'http://local').href)
  const next = address ? address.next : here
  const open = useCallback((step: SignInStep = 'sign-in', options?: { replace?: boolean }) => navigate(signInPath({ step, next }), options), [navigate, next])
  const link = useCallback((step: SignInStep = 'sign-in', options?: { replace?: boolean }) => ({ href: `${basePath}${signInPath({ step, next })}`, onFollow: () => open(step, options) }), [basePath, next, open])
  const leave = useCallback(() => navigate(next ?? '/', { replace: true }), [navigate, next])
  return { address, next, open, link, leave }
}
