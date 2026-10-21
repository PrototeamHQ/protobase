import type { FieldModel, ResourceModel } from '@protobase/schema'
import { parseTable } from '@protobase/schema/internal'
import type { Row } from '../types'

/**
 * What an encrypted value is bound to, so that it opens only where it was sealed: its table as `.table()` names it (no
 * schema when that names none), its column, and its record's tenant and key as the API shows them. `null` tenant and key
 * mark the binding of a create's first write, before the database has made the key.
 */
export type Binding = {
  schema: string | null
  table: string
  column: string
  tenant: string | null
  key: string[] | null
}

const textOf = (record: Row, name: string) => {
  const value = record[name]
  if (value === undefined) throw new Error(`Binding an encrypted value needs the record's "${name}"`)
  return String(value)
}

const tableOf = (model: ResourceModel, field: FieldModel) => ({ schema: model.table.schema ?? null, table: model.table.name, column: field.column })

/**
 * The binding of `field` in `record`. The record must be a row as `fetchRecord`, `insertRecord` and `updateRecord` return
 * it, its columns selected under their field names and passed through `exposeRow`, so its key and tenant are the text the
 * API shows (a lowercase uuid, a bigint as text, a timestamptz as ISO text with milliseconds).
 */
export const bindingOf = (model: ResourceModel, field: FieldModel, record: Row): Binding => ({
  ...tableOf(model, field),
  tenant: model.tenant && record[model.tenant] !== null ? textOf(record, model.tenant) : null,
  key: model.primaryKey.map((name) => textOf(record, name)),
})

/** The binding of a create's first write, whose key the database has not made yet: it is bound again in the same transaction. */
export const pendingBinding = (model: ResourceModel, field: FieldModel): Binding => ({ ...tableOf(model, field), tenant: null, key: null })

/** Where a value was before a rename: `binding` with the table (as `.table()` wrote it) or the column that `from` names. */
export const movedBinding = (binding: Binding, from: { table?: string; column?: string }): Binding => {
  const table = from.table === undefined ? undefined : parseTable(from.table)
  return {
    ...binding,
    ...(table && { schema: table.schema ?? null, table: table.name }),
    ...(from.column !== undefined && { column: from.column }),
  }
}

/** The additional authenticated data of an envelope: JSON of an array, which no dot in a name or order of a key confuses. */
export const aadOf = (kid: string, { schema, table, column, tenant, key }: Binding) =>
  Buffer.from(JSON.stringify(['pbenc', 1, kid, schema, table, column, tenant, key]), 'utf8')
