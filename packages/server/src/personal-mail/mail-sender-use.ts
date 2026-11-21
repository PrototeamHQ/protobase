import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { Entry } from '../registry'
import { columnId, tableId } from '../sql-parts'

/** How many records of `resource` hold an address in an `f.mailSender()` field. */
export type MailSenderUse = { resource: string; count: number }

/** Finds where an address is held, before its owner deletes it or disconnects its mailbox (see `mailSenderUseCheck`). */
export type FindMailSenderUse = (address: string) => Promise<MailSenderUse[]>

// The resources with a mail sender field, with those fields: a lookup's value lives in another table, which holds it.
const holders = (entries: readonly Entry[]) =>
  entries.flatMap((entry) => {
    const fields = Object.values(entry.model.fields).filter((field) => field.type === 'mail_sender' && !field.lookup)
    return fields.length > 0 ? [{ entry, fields }] : []
  })

/**
 * The resources whose records hold `address` in an `f.mailSender()` field, deleted and every tenant's records
 * included, with how many, counted in one query; empty when none does. An address is stored as the sender spells it
 * (see `checkMailSenders`), so it is matched exactly, which an index on the column serves.
 */
export const mailSenderUse = (db: Db, entries: readonly Entry[]): FindMailSenderUse => {
  const found = holders(entries)
  return async (address) => {
    if (found.length === 0) return []
    const counts = found.map(({ entry, fields }) => {
      const matches = sql.join(fields.map((field) => sql`${columnId(field)} = ${address}`), sql` or `)
      return sql`select ${entry.name}::text as resource, count(*)::int as count from ${tableId(entry.model)} where ${matches}`
    })
    const { rows } = await sql<MailSenderUse>`${sql.join(counts, sql` union all `)}`.execute(db)
    return rows.filter((row) => row.count > 0)
  }
}
