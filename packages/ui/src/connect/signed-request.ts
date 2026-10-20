import { readConnectAddress } from '@protobase/schema'

/**
 * The signed request in `url` when the server sends the browser back to this page (`here`: its origin and path), else
 * `undefined`. The origin counts as well as the path: a client's own redirect URI can have this page's path, on its
 * host or a loopback port, and a query of its choosing; and only a query with the provider's signature is a request.
 */
export const signedRequestFor = (url: string, here: { origin: string; pathname: string }) => {
  const target = new URL(url, here.origin)
  if (target.origin !== here.origin || target.pathname !== here.pathname) return undefined
  return readConnectAddress(target.search).oauthQuery
}
