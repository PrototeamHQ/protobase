import { sql, type SqlBool } from 'kysely'
import type { Db } from '@protobase/query'
import type { Entry } from '../registry'
import { columnId, scopeConditions, tableId } from '../sql-parts'

/** Whether any record holds an address, asked before its owner deletes it or disconnects its mailbox (see `mailSenderUseCheck`). */
export type FindMailSenderUse = (address: string) => Promise<boolean>

// The resources with a mail sender field, with those fields: a lookup's value lives in another table, which holds it.
const holders = (entries: readonly Entry[]) =>
  entries.flatMap((entry) => {
    const fields = Object.values(entry.model.fields).filter((field) => field.type === 'mail_sender' && !field.lookup)
    return fields.length > 0 ? [{ entry, fields }] : []
  })

/**
 * Whether a record of any resource, every tenant's included, holds `address` in an `f.mailSender()` field, in one
 * query: a soft-deleted record, which no list shows to change, holds none, and shows its address as not available if
 * restored. The address is matched without regard to case, as sending matches it, since a mailbox's own address may
 * be spelled otherwise than the record holds it; an index on the column's `lower()` serves it.
 */
export const mailSenderUse = (db: Db, entries: readonly Entry[]): FindMailSenderUse => {
  const found = holders(entries)
  return async (address) => {
    if (found.length === 0) return false
    const held = found.map(({ entry, fields }) => {
      const matches = sql<SqlBool>`(${sql.join(fields.map((field) => sql`lower(${columnId(field)}) = lower(${address})`), sql` or `)})`
      const live = scopeConditions(entry.model)
      return sql`exists (select from ${tableId(entry.model)} where ${sql.join([matches, ...live], sql` and `)})`
    })
    const { rows } = await sql<{ used: boolean }>`select ${sql.join(held, sql` or `)} as used`.execute(db)
    return rows[0]!.used
  }
}
