import type { ResourceModel } from '@protobase/schema'
import { sameTable } from '../encryption/shared-columns'
import type { Filter } from './parse-filter'
import type { OrderTerm } from './parse-order'
import { restError } from './rest-error'

// `/api/sb/rest/v1` writes and reads the table with plain SQL, so it can neither seal an encrypted field's value nor
// compare it: it refuses what touches such a column instead. Encrypted fields are written through `/api/v1`.

/**
 * The table a request reaches: the served resource's, guarded by the encrypted fields of every resource over it, since
 * a request writes any column of the table, also one the served resource leaves out.
 */
export type GuardedTable = { name: string; models: readonly ResourceModel[] }

export const guardedTable = (served: ResourceModel, models: readonly ResourceModel[]): GuardedTable => ({
  name: served.table.name,
  models: models.filter((model) => sameTable(model, served)),
})

const encryptedColumns = (table: GuardedTable) =>
  new Set(table.models.flatMap((model) => Object.values(model.fields).filter((field) => field.encrypted).map((field) => field.column)))

// The columns encrypted values are bound to: the key and tenant of each resource with encrypted fields.
const bindingColumns = (table: GuardedTable) =>
  table.models
    .filter((model) => Object.values(model.fields).some((field) => field.encrypted))
    .flatMap((model) => [...model.primaryKey, ...(model.tenant ? [model.tenant] : [])].map((name) => model.fields[name]!.column))

const refusal = (table: GuardedTable, column: string, what: string) =>
  restError(400, 'encrypted-column', `Column '${column}' of '${table.name}' is encrypted: it cannot be ${what} here`, null, 'Write and reveal encrypted fields through /api/v1')

const filterColumns = (filter: Filter): string[] => (filter.kind === 'condition' ? [filter.field.column] : filter.args.flatMap(filterColumns))

/** Refuses filters, a sort or a join on an encrypted column, whose ciphertext no comparison matches. */
export const refuseEncryptedReads = (table: GuardedTable, filters: readonly Filter[], order: readonly OrderTerm[], joined: readonly string[] = []) => {
  const encrypted = encryptedColumns(table)
  const read = [...filters.flatMap(filterColumns), ...order.map((term) => term.field.column), ...joined].find((column) => encrypted.has(column))
  if (read !== undefined) throw refusal(table, read, 'filtered, sorted or joined on')
}

/** Refuses a write of an encrypted column, or matching an upsert's rows on one. */
export const refuseEncryptedWrite = (table: GuardedTable, columns: readonly string[]) => {
  const encrypted = encryptedColumns(table)
  const written = columns.find((column) => encrypted.has(column))
  if (written !== undefined) throw refusal(table, written, 'written or matched on')
}

/**
 * On a table with encrypted fields, refuses a write that changes the key or tenant of a row, which its encrypted values
 * are bound to: an update's `columns`, or an upsert's beyond the `kept` ones it matches rows on and so writes unchanged.
 */
export const refuseRebinding = (table: GuardedTable, columns: readonly string[], kept: readonly string[] = []) => {
  const rebound = bindingColumns(table).find((column) => columns.includes(column) && !kept.includes(column))
  if (rebound !== undefined) throw restError(400, 'encrypted-column', `Column '${rebound}' of '${table.name}' cannot change here: its encrypted fields are bound to it`, null, 'Change it through /api/v1')
}
