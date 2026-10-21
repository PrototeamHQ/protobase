import { findInvalidTrustedProxies, getIPFromHeader } from '@better-auth/core/utils/ip'

/** The proxies whose `X-Forwarded-For` is believed: addresses or CIDR ranges, comma separated (PROTOBASE_TRUSTED_PROXIES). */
export const readTrustedProxies = (value: string | undefined) => {
  const proxies = (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
  const invalid = findInvalidTrustedProxies(proxies)
  if (invalid.length > 0) throw new Error(`PROTOBASE_TRUSTED_PROXIES must be addresses or CIDR ranges, comma separated, not "${invalid.join(', ')}"`)
  return proxies
}

/**
 * The client a request comes from: the socket's peer, or, when that is one of `trustedProxies`, the rightmost address
 * of its `X-Forwarded-For` that is not one, as each proxy appends the address it took the request from. A chain of
 * trusted proxies only, or one with an entry that is no address, leaves the peer.
 */
export const clientAddress = (peer: string, forwardedFor: string | null, trustedProxies: string[]) => {
  const chain = trustedProxies.length > 0 && forwardedFor ? `${forwardedFor}, ${peer}` : peer
  // The whole IPv6 address, which audit events keep; the rate limits key on its /64 themselves.
  return getIPFromHeader(chain, { trustedProxies, ipv6Subnet: 128 }) ?? peer
}

type NodeFetch = (request: Request, env: { incoming: { socket: { remoteAddress?: string } } }) => Response | Promise<Response>

/**
 * `fetch` with each request's `X-Forwarded-For` replaced by its client's one address, which the sign-in and form rate
 * limits key on and audit events record, so a client never picks its own bucket. Without a peer, a closed socket, the
 * header is dropped.
 */
export const withClientAddress = (fetch: NodeFetch, trustedProxies: string[]): NodeFetch => (request, env) => {
  const peer = env.incoming.socket.remoteAddress
  if (peer) request.headers.set('x-forwarded-for', clientAddress(peer, request.headers.get('x-forwarded-for'), trustedProxies))
  else request.headers.delete('x-forwarded-for')
  return fetch(request, env)
}
