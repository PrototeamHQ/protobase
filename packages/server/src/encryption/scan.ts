import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { FieldModel } from '@protobase/schema'
import type { Entry } from '../registry'
import { exposeRow } from '../rows'
import { aliasedColumn, columnId, tableId } from '../sql-parts'
import type { Row } from '../types'

/** Where the database finds a row again: its own text of each key column and of the tenant. */
export type RowAddress = { key: string[]; tenant: string | null }

/** A row of the scanned column: as the server reads it (for its binding), its address, and the stored value. */
export type ScannedRow = { record: Row; address: RowAddress; stored: string }

/** The one connection a scan runs on, which also takes every write the scan's batches make. */
export type PinnedConnection = Db

const batchSize = 500
const cursor = sql.id('pb_encryption_scan')
const keyAlias = (i: number) => `__pb_key_${i}`
const tenantAlias = '__pb_tenant'

/** The fields a binding needs, and the field itself. */
export const scannedFields = (entry: Entry, field: FieldModel) => {
  const { model } = entry
  const names = [...new Set([...model.primaryKey, ...(model.tenant ? [model.tenant] : []), field.name])]
  return names.map((name) => model.fields[name]!)
}

const declareScan = (entry: Entry, field: FieldModel) => {
  const { model } = entry
  const keys = model.primaryKey.map((name, i) => sql`${columnId(model.fields[name]!)}::text as ${sql.id(keyAlias(i))}`)
  const tenant = model.tenant ? [sql`${columnId(model.fields[model.tenant]!)}::text as ${sql.id(tenantAlias)}`] : []
  const columns = sql.join([...scannedFields(entry, field).map(aliasedColumn), ...keys, ...tenant])
  return sql`declare ${cursor} no scroll cursor with hold for select ${columns} from ${tableId(model)} where ${columnId(field)} is not null`
}

const scanned = (entry: Entry, field: FieldModel, row: Row): ScannedRow => ({
  record: exposeRow(entry.model, row),
  address: { key: entry.model.primaryKey.map((_, i) => String(row[keyAlias(i)])), tenant: (row[tenantAlias] as string | null | undefined) ?? null },
  stored: String(row[field.name]),
})

/**
 * Reads every row of the table whose column `field` is not null, every tenant and soft-deleted rows included, in batches
 * handed to `onBatch` with the connection the scan runs on. A holdable cursor keeps the rows as they were when the scan
 * began, so each comes once without an order, and the batches' writes run on the same connection in transactions of
 * their own: a pool of one connection is enough. Rows written after the scan began are not in it.
 */
export const scanColumn = (db: Db, entry: Entry, field: FieldModel, onBatch: (rows: ScannedRow[], connection: PinnedConnection) => Promise<void>) =>
  db.connection().execute(async (connection) => {
    let declared = false
    try {
      await sql`begin`.execute(connection)
      await declareScan(entry, field).execute(connection)
      declared = true
      await sql`commit`.execute(connection)
      for (;;) {
        const { rows } = await sql<Row>`fetch ${sql.raw(String(batchSize))} from ${cursor}`.execute(connection)
        if (rows.length === 0) return
        await onBatch(rows.map((row) => scanned(entry, field, row)), connection)
      }
    } finally {
      // A batch that failed leaves its transaction open, and the cursor must not outlive the scan on a pooled connection.
      await sql`rollback`.execute(connection)
      if (declared) await sql`close ${cursor}`.execute(connection)
    }
  })
