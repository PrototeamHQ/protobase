import type { MiddlewareHandler } from 'hono'
import { capacitorOrigins } from '../mobile-config'

type GuardContext = { skipCSRFCheck: boolean; skipOriginCheck: boolean | string[]; isTrustedOrigin: (url: string) => boolean }

const mediaType = (request: Request) => request.headers.get('content-type')?.split(';')[0]!.trim().toLowerCase()

/**
 * The checks Better Auth's router makes, for Protobase's own POST routes under `/api/auth`, which Better Auth's handler
 * never sees: a JSON body only, which a page cannot send without a preflight `/api/auth` does not answer, and, for a
 * request with cookies, an Origin (else Referer) Better Auth trusts, so another page on the same site cannot act with
 * the session cookie. With `mobile`, the app's Capacitor origins are trusted too, as `handleMobile` trusts them.
 */
export const ownRouteGuard = ({ context, mobile }: { context: () => Promise<GuardContext>; mobile: boolean }): MiddlewareHandler => {
  return async (c, next) => {
    const request = c.req.raw
    if (mediaType(request) !== 'application/json') {
      return c.json({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'This request takes a JSON body only.' }, 415)
    }
    const auth = await context()
    // As in Better Auth: a request without cookies carries no session a page could borrow.
    if (auth.skipCSRFCheck || auth.skipOriginCheck === true || !request.headers.has('cookie')) return next()
    const origin = request.headers.get('origin') || request.headers.get('referer') || ''
    if (!origin || origin === 'null') return c.json({ code: 'MISSING_OR_NULL_ORIGIN', message: 'Missing or null Origin' }, 403)
    const trusted = auth.isTrustedOrigin(origin) || (mobile && capacitorOrigins.includes(origin))
    if (!trusted) return c.json({ code: 'INVALID_ORIGIN', message: 'Invalid origin' }, 403)
    return next()
  }
}
