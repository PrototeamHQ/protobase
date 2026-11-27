import type { Transport } from '../transport'

/**
 * The live token of a read of `resource` (`Prefer: live`): every record of it the caller may read, one record read and
 * every field, so the token covers what any page of theirs shows of it. Undefined when the read gives none, such as for
 * a resource with a record-level read rule.
 */
export const readLiveToken = async (send: Transport, resource: string) => {
  const response = await send({ method: 'GET', path: `/${encodeURIComponent(resource)}`, query: 'limit=1', headers: { prefer: 'live' }, cache: 'no-store' })
  return response.headers.get('protobase-live') ?? undefined
}
