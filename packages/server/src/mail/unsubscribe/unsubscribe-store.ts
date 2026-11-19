import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { UnsubscribeTarget } from './unsubscribe-token'

/** The schema of the opt-outs, named for what it holds. */
export const unsubscribesSchema = 'mail'

/** The table of the opt-outs: one row per recipient and topic. */
export const unsubscribesTable = `${unsubscribesSchema}.unsubscribes`

/** Records that `recipient` unsubscribed from `topic`; recording it again changes nothing. */
export const recordUnsubscribe = async (db: Db, { recipient, topic }: UnsubscribeTarget) => {
  await sql`insert into mail.unsubscribes (recipient, topic, created_at) values (${recipient.toLowerCase()}, ${topic}, now()) on conflict (recipient, topic) do nothing`.execute(db)
}

/** Which of `recipients`, lower-cased, unsubscribed from `topic`: one query, served by the table's unique index. */
export const unsubscribedOf = async (db: Db, topic: string, recipients: readonly string[]) => {
  if (recipients.length === 0) return []
  const lower = recipients.map((recipient) => recipient.toLowerCase())
  const { rows } = await sql<{ recipient: string }>`select recipient from mail.unsubscribes where topic = ${topic} and recipient = any(${lower}::text[])`.execute(db)
  return rows.map((row) => row.recipient)
}
