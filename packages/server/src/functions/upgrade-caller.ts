import { forbidden } from '../problem'
import type { Authenticator } from '../types'

export type UpgradeAuthenticatorInput = {
  /** The app's own authenticator, as for a plain call. */
  authenticate: Authenticator
  /** The origins a browser may open a socket from with its cookie: every origin the app is served on. */
  origins?: readonly string[]
  /** The bearer token of the session a request's cookie carries, or a 401 problem without one. */
  sessionToken?: (request: Request) => Promise<string>
}

const hostOf = (url: string) => (URL.canParse(url) ? new URL(url).host : undefined)

// A browser sends `Origin` with every socket, `null` from a sandboxed page or a file; only a listed origin, or without a
// list the request's own host, is the app's own page. Without `Origin`, the client is no browser and holds its own credentials.
export const allowedOrigin = (request: Request, origins?: readonly string[]) => {
  const origin = request.headers.get('origin')
  if (origin === null) return true
  if (origins) return origins.includes(origin)
  const host = hostOf(origin)
  return host !== undefined && host === new URL(request.url).host
}

/**
 * The caller of a WebSocket upgrade, which a browser opens with its session cookie and no headers of its own: refused
 * with 403 from a foreign origin (cross-site WebSocket hijacking), then by its bearer token when it has one, otherwise
 * by the bearer token its cookie's session mints, which goes through `authenticate` with all the request's other
 * headers, as a plain call would.
 */
export const upgradeAuthenticator = ({ authenticate, origins, sessionToken }: UpgradeAuthenticatorInput): Authenticator => async (request) => {
  if (!allowedOrigin(request, origins)) throw forbidden('foreign-origin', 'This page’s origin may not open a socket to this app')
  if (request.headers.has('authorization') || !request.headers.has('cookie') || !sessionToken) return authenticate(request)
  const headers = new Headers(request.headers)
  headers.set('authorization', `Bearer ${await sessionToken(request)}`)
  return authenticate(new Request(request, { headers }))
}
