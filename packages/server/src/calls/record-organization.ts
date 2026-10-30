import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { decodeKey } from '@protobase/schema/internal'
import type { Registry } from '../registry'
import type { CallRecord } from './call-store'

/**
 * The organization a call's record is in, read from the record's own tenant field with no access check: `null` for a
 * record of a resource without a tenant, or one that is gone, which no organization's switch covers. A key of a relation
 * to a resource with a key of several fields is read as none either, so its calls take no guests.
 */
export const recordOrganization = (registry: Registry) => async (trx: Db, record: CallRecord) => {
  const entry = registry.find(record.resource)
  const tenant = entry?.model.tenant
  if (!entry || !tenant) return null
  const { model } = entry
  const decoded = decodeKey(record.key, entry.keyTypes)
  const values = Array.isArray(decoded) ? decoded : [decoded]
  if (values.length !== model.primaryKey.length) return null
  const table = model.table.schema ? sql.id(model.table.schema, model.table.name) : sql.id(model.table.name)
  const where = sql.join(model.primaryKey.map((name, index) => sql`${sql.id(model.fields[name]!.column)} = ${values[index]}`), sql` and `)
  const { rows } = await sql<{ tenant: unknown }>`select ${sql.id(model.fields[tenant]!.column)} as tenant from ${table} where ${where}`.execute(trx)
  const found = rows[0]?.tenant
  return found === undefined || found === null ? null : String(found)
}
