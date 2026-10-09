import type { Db } from '@protobase/query'
import type { CheckedFilter } from '@protobase/schema'
import { ifMatchSatisfied } from './etag'
import type { Deps } from './deps'
import { forbidden, notFound, preconditionFailed, preconditionRequired } from './problem'
import type { Entry } from './registry'
import { fetchRecord, type StoredRecord } from './records'
import { andFilters, recordDecision, type RequestAccess } from './request-access'
import { pickFields } from './rows'
import { tenantScope } from './tenant'
import type { Row, WriteEvent } from './types'

export type WriteResult = { record: Row; etag: string }

export const missing = (entry: Entry) => notFound(`No ${entry.name} with this key`)

export const checkPrecondition = (current: StoredRecord, ifMatch: string | null, required: boolean) => {
  if (ifMatch === null) {
    if (required) throw preconditionRequired('Send the ETag of the record you read in an If-Match header (or * for any version)')
    return
  }
  if (!ifMatchSatisfied(ifMatch, current.etag)) throw preconditionFailed('The record changed since it was read; fetch it again')
}

export const denied = (entry: Entry, operation: string) => forbidden('access-denied', `You may not ${operation} this ${entry.name} record`)

// A record-level rule decides with the stored record (and the input); a filter it returns is checked in the database.
export const decide = async (access: RequestAccess, operation: 'create' | 'update' | 'delete', record?: Row, input?: Row) => {
  if (!access.resolved.recordChecks.includes(operation)) return undefined
  const decision = await recordDecision(access, operation, record, input)
  if (decision === false) throw denied(access.entry, operation)
  return decision === true ? undefined : decision
}

export const keyOf = (access: RequestAccess, record: Row) => access.full.primaryKey.map((name) => record[name] as string | number)

export const firstKeyField = (access: RequestAccess) => access.full.fields[access.full.primaryKey[0]!]!

// Row filters and record-level filters are checked in the database against the row as written, with the same semantics as
// reads; a miss throws, which rolls the write back.
export const assertWritten = async (trx: Db, access: RequestAccess, written: StoredRecord, operation: string, ...filters: Array<CheckedFilter | undefined>) => {
  const filter = andFilters(filters)
  if (!filter) return
  const visible = await fetchRecord(trx, access.entry, keyOf(access, written.record), tenantScope(access.entry, access.session)?.tenantValue, { filter, fields: [firstKeyField(access)] })
  if (!visible) throw denied(access.entry, `leave in that state (${operation})`)
}

/** The caller sees the readable fields only; hooks get the whole record. */
export const shown = (access: RequestAccess, written: StoredRecord): WriteResult => ({
  record: pickFields(written.record, Object.keys(access.model.fields)),
  etag: written.etag,
})

/** Runs the pipeline hooks for one write, inside the transaction. */
export const notifier = (deps: Deps, access: RequestAccess) => async (trx: Db, kind: WriteEvent['operation'], before?: Row, after?: Row) => {
  const { session } = access
  const event: WriteEvent = {
    operation: kind,
    resource: access.full,
    user: session.user,
    ...(session.tenant !== undefined && { tenant: session.tenant }),
    ...(before && { before }),
    ...(after && { after }),
  }
  for (const hook of deps.hooks) await hook(event, trx)
}
