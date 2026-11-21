import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { MailFeedback } from './feedback-record'

/** The schema of the feedback, named for what it holds; shared with the unsubscribes. */
export const feedbackSchema = 'mail'

/** The table of the feedback: one row per report and recipient. */
export const feedbackTable = `${feedbackSchema}.feedback`

/** A provider's report: who sent it (`ses`, `resend` or `protobase`), its id at that provider, and a record per recipient. */
export type FeedbackReport = { provider: string; eventId: string; records: readonly MailFeedback[] }

/**
 * Writes the report's records in one statement, the recipients lower-cased; a report the provider sends again, as it
 * does when it gets no answer in time, writes nothing new.
 */
export const recordFeedback = async (db: Db, { provider, eventId, records }: FeedbackReport) => {
  if (records.length === 0) return
  const rows = records.map((record) => ({ ...record, recipient: record.recipient.toLowerCase() }))
  await sql`insert into mail.feedback (provider, event_id, type, bounce_type, recipient, message_id, provider_message_id, reason, occurred_at, created_at)
    select ${provider}, ${eventId}, row.type, row.bounce_type, row.recipient, row.message_id, row.provider_message_id, row.reason, row.occurred_at, now()
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as row(type text, bounce_type text, recipient text, message_id text, provider_message_id text, reason text, occurred_at timestamptz)
    on conflict (provider, event_id, recipient) do nothing`.execute(db)
}
