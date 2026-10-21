import type { ResourceModel } from '@protobase/schema'
import type { Filter } from './parse-filter'
import type { OrderTerm } from './parse-order'
import { restError } from './rest-error'

// `/api/sb/rest/v1` writes and reads the table with plain SQL, so it can neither seal an encrypted field's value nor
// compare it: it refuses what touches such a column instead. Encrypted fields are written through `/api/v1`.

const encryptedColumns = (model: ResourceModel) =>
  new Set(Object.values(model.fields).filter((field) => field.encrypted).map((field) => field.column))

// The columns an encrypted value is bound to: its record's key and tenant.
const bindingColumns = (model: ResourceModel) =>
  [...model.primaryKey, ...(model.tenant ? [model.tenant] : [])].map((name) => model.fields[name]!.column)

const refusal = (model: ResourceModel, column: string, what: string) =>
  restError(400, 'encrypted-column', `Column '${column}' of '${model.table.name}' is encrypted: it cannot be ${what} here`, null, 'Write and reveal encrypted fields through /api/v1')

const filterColumns = (filter: Filter): string[] => (filter.kind === 'condition' ? [filter.field.column] : filter.args.flatMap(filterColumns))

/** Refuses filters, a sort or a join on an encrypted column, whose ciphertext no comparison matches. */
export const refuseEncryptedReads = (model: ResourceModel, filters: readonly Filter[], order: readonly OrderTerm[], joined: readonly string[] = []) => {
  const encrypted = encryptedColumns(model)
  const read = [...filters.flatMap(filterColumns), ...order.map((term) => term.field.column), ...joined].find((column) => encrypted.has(column))
  if (read !== undefined) throw refusal(model, read, 'filtered, sorted or joined on')
}

/** Refuses a write of an encrypted column, or matching an upsert's rows on one. */
export const refuseEncryptedWrite = (model: ResourceModel, columns: readonly string[]) => {
  const encrypted = encryptedColumns(model)
  const written = columns.find((column) => encrypted.has(column))
  if (written !== undefined) throw refusal(model, written, 'written or matched on')
}

/**
 * On a table with encrypted fields, refuses a write that changes the key or tenant of a row, which its encrypted values
 * are bound to: an update's `columns`, or an upsert's beyond the `kept` ones it matches rows on and so writes unchanged.
 */
export const refuseRebinding = (model: ResourceModel, columns: readonly string[], kept: readonly string[] = []) => {
  if (encryptedColumns(model).size === 0) return
  const rebound = bindingColumns(model).find((column) => columns.includes(column) && !kept.includes(column))
  if (rebound !== undefined) throw restError(400, 'encrypted-column', `Column '${rebound}' of '${model.table.name}' cannot change here: its encrypted fields are bound to it`, null, 'Change it through /api/v1')
}
