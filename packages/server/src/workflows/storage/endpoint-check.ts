import { isIP } from 'node:net'
import { isPrivateAddress } from '../../webhooks/table/address-check'
import { resolveHost, type Resolve } from '../../webhooks/table/pinned-request'

export type EndpointRules = {
  /** The origins the operator allows (`workflows.storage.endpoints`). */
  endpoints: readonly string[]
  allowPrivateAddresses: boolean
  resolve?: Resolve
}

/**
 * Why an author's S3 endpoint is refused, or `undefined`: it must be one of the operator's `https://` origins, and its
 * host must resolve to public addresses only. The S3 client resolves the host again as it connects, which is why only
 * origins the operator vouches for are taken.
 */
export const endpointProblem = async (endpoint: string, { endpoints, allowPrivateAddresses, resolve = resolveHost }: EndpointRules) => {
  const url = URL.canParse(endpoint) ? new URL(endpoint) : undefined
  if (!url || url.protocol !== 'https:') return 'endpoint must be an https:// address'
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return 'endpoint must be an origin, with no path, user or query'
  if (!endpoints.includes(url.origin)) return endpoints.length === 0 ? 'this app allows no endpoint: leave it out for the default host' : `endpoint must be one the app allows: ${endpoints.join(', ')}`
  if (allowPrivateAddresses) return undefined
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [host] : await resolve(host)
  if (addresses.length === 0) return `${host} resolves to no address`
  const blocked = addresses.find(isPrivateAddress)
  return blocked === undefined ? undefined : `${host} is a private address (${blocked}); storage reaches public addresses only`
}
