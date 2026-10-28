import type { Deps } from '../deps'
import { fetchReadable } from '../fetch-readable'
import { HttpProblem } from '../problem'
import { requestAccess } from '../request-access'
import { readTransaction } from '../transactions'
import type { Session } from '../types'
import type { ChannelRecord } from './channel-name'

// What a read of the record answers for a caller who may not see it, whom a channel refuses as for no record at all.
const refusedStatuses = new Set([401, 403, 404])

/**
 * Whether the caller may read the record, as `GET /api/<resource>/<key>` decides it: the resource's read access, the
 * tenant, the row filter, the parents read and a record-level read rule. A soft-deleted record is not readable.
 */
export const recordReadable = async (deps: Deps, session: Session, { entry, key }: ChannelRecord) => {
  const read = async () => {
    const access = await requestAccess(deps, entry, session)
    if (!access.resolved.operations.read) return false
    const primary = access.full.fields[access.full.primaryKey[0]!]!
    const found = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) => fetchReadable(trx, access, key, 'hide', { fields: [primary] }))
    return found !== undefined
  }
  return read().catch((error: unknown) => {
    if (error instanceof HttpProblem && refusedStatuses.has(error.status)) return false
    throw error
  })
}
