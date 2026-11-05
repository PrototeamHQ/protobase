import { AddressRefusedError, fetchMaxBytes, ResponseTooLargeError, type PluginFetch } from '@protobase/workflows/plugin'
import { AddressRefusedError as PinnedRefused, pinnedRequest, type Resolve } from '../webhooks/table/pinned-request'
import { readLimited } from '../webhooks/table/read-limited'

export type PluginFetchOptions = {
  /** Lets requests reach private, loopback and link-local addresses, for development and tests. Default false. */
  allowPrivateAddresses?: boolean
  resolve?: Resolve
  ca?: string | Buffer
}

const nullBodyStatuses = new Set([204, 205, 304])

/**
 * The plugin context's `fetch`: the pinned request, which resolves the host once, refuses a non-public address and
 * connects to the address it checked, following no redirect; then at most `maxBytes` of the body as it came off the
 * wire, since the client decodes no `Content-Encoding`. Past that it throws `ResponseTooLargeError`.
 */
export const pluginFetch = ({ allowPrivateAddresses = false, resolve, ca }: PluginFetchOptions = {}): PluginFetch => async (url, init = {}) => {
  // A limit that is no number of bytes, such as NaN, would read nothing and pass an empty body off as the answer.
  if (init.maxBytes !== undefined && !(Number.isFinite(init.maxBytes) && init.maxBytes >= 0)) throw new RangeError(`maxBytes is ${init.maxBytes}; give a number of bytes, 0 or more`)
  const maxBytes = Math.min(init.maxBytes ?? fetchMaxBytes, fetchMaxBytes)
  const { method = 'GET', headers, body, signal } = init
  const answer = await pinnedRequest(url, { method, ...(headers && { headers }), ...(body !== undefined && { body }), ...(signal && { signal }) }, { allowPrivateAddresses, ...(resolve && { resolve }), ...(ca && { ca }) }).catch((error: unknown) => {
    if (error instanceof PinnedRefused) throw new AddressRefusedError(error.message)
    throw error
  })
  const bytes = await readLimited(answer, maxBytes + 1)
  if (bytes.length > maxBytes) throw new ResponseTooLargeError(maxBytes)
  return new Response(nullBodyStatuses.has(answer.status) ? null : bytes, { status: answer.status, headers: answer.headers })
}
