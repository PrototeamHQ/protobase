import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { encodeKey } from '@protobase/schema/internal'
import { fetchReadable } from './fetch-readable'
import { decodeKeyText } from './key'
import { isDatabaseError, takenProblem } from './error-handler'
import { insertRecord, insertUnlessTaken, takenKeySetting, type Shape } from './records'
import type { RequestAccess } from './request-access'
import type { Row } from './types'
import { firstKeyField } from './write-shared'

// The record insertUnlessTaken found, as the API addresses it, when the caller may read it: the same checks as reading it
// (tenant, row filter, parents read, a record-level rule), so a 409 never confirms a record the caller cannot see.
const readableTakenKey = async (trx: Db, access: RequestAccess) => {
  if (!access.resolved.operations.read) return
  const { rows } = await sql<{ key: string }>`select current_setting(${takenKeySetting}) as key`.execute(trx)
  const key = decodeKeyText(access.entry, encodeKey(JSON.parse(rows[0]!.key) as string[]))
  const found = await fetchReadable(trx, access, key, 'hide', { fields: [firstKeyField(access)] })
  return found ? encodeKey(key) : undefined
}

/**
 * Inserts a create's row. On a resource with `.openExisting()`, a row whose values of that unique key a record already
 * holds is refused with the 409 any unique violation answers, plus that record's key when the caller may read it. A
 * row with no values given at all is inserted plainly, as the conflict needs a column to name.
 */
export const insertOrOpen = async (trx: Db, access: RequestAccess, values: Row, shape: Shape) => {
  const unique = access.full.openExisting
  if (!unique || Object.keys(values).length === 0) return insertRecord(trx, access.entry, values, shape)
  const inserted = await insertUnlessTaken(trx, access.entry, values, unique, shape).catch((error: unknown) => {
    // SQLSTATE 42P10: no unique index has exactly these columns, which `protobase doctor` reports as well
    if (isDatabaseError(error) && error.code === '42P10') throw new Error(`The openExisting fields of ${access.entry.name} (${unique.join(', ')}) are not the columns of a unique index of its table`)
    throw error
  })
  if (inserted) return inserted
  throw takenProblem(await readableTakenKey(trx, access))
}
