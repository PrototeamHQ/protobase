import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { migrationCommand } from '../../changes/capture-schema'
import { hasIndexes } from '../../has-indexes'
import { feedbackSchema, feedbackTable } from './feedback-store'

/**
 * The table's indexes by name: the unique one a report sent again stands on, a missing recipient counting as one, and
 * those of the admin list's filters and sort: the recipient, the message ids an app looks a send up by, and the type.
 */
const indexes = [
  ['feedback_provider_event_recipient_once', 'unique', '("provider", "event_id", "recipient") nulls not distinct'],
  ['feedback_recipient', '', '("recipient")'],
  ['feedback_message_id', '', '("message_id")'],
  ['feedback_provider_message_id', '', '("provider_message_id")'],
  ['feedback_type', '', '("type")'],
  ['feedback_created_at', '', '("created_at")'],
] as const

const indexesSql = () => indexes.map(([name, kind, columns]) => `create ${kind ? `${kind} ` : ''}index if not exists "${name}" on ${feedbackTable} ${columns};`).join('\n')

// A complaint may leave its recipient out, as a provider that hides who complained does, when it names its message.
const namesRecipient = `constraint "feedback_names_recipient" check ("recipient" is not null or ("type" = 'complaint' and "message_id" is not null))`

/** A row per recipient of each bounce or complaint report; a value the report does not state is NULL. */
export const feedbackTableSql = () => `create schema if not exists "${feedbackSchema}";

create table if not exists ${feedbackTable} (
  "id" bigint generated always as identity primary key,
  "provider" text not null,
  "event_id" text not null,
  "type" text not null check ("type" in ('bounce', 'complaint')),
  "bounce_type" text check ("bounce_type" is null or ("bounce_type" in ('hard', 'soft') and "type" = 'bounce')),
  "recipient" text check ("recipient" = lower("recipient")),
  "message_id" text,
  "provider_message_id" text,
  "reason" text,
  "occurred_at" timestamptz,
  "created_at" timestamptz not null,
  ${namesRecipient}
);

${indexesSql()}`

/**
 * A table of an earlier version, whose every record named its recipient, made to take a complaint without one: its
 * unique index replaced by one that counts a missing recipient as one, which a write of that version stands on too. It
 * runs again on a table that has the constraint but lost that index, so it replaces the constraint rather than adding it.
 */
const recipientOptionalSql = () => `alter table ${feedbackTable} alter column "recipient" drop not null,
  drop constraint if exists "feedback_names_recipient",
  add ${namesRecipient};
${indexesSql()}
drop index if exists "${feedbackSchema}"."feedback_provider_event_recipient";`

// Only reads the catalogue.
const hasTable = async (db: Db) => (await sql<{ found: boolean }>`select to_regclass(${feedbackTable}) is not null as found`.execute(db)).rows[0]!.found

/** The SQL that adds the feedback's schema and table, the indexes it lacks, or what an earlier version's table lacks; `undefined` when it has them all. */
export const mailFeedbackMigration = async (db: Db) => {
  if (!(await hasTable(db))) return feedbackTableSql()
  if (!(await hasIndexes(db, feedbackSchema, 'feedback', [indexes[0][0]]))) return recipientOptionalSql()
  if (await hasIndexes(db, feedbackSchema, 'feedback', indexes.map(([name]) => name))) return
  return feedbackTableSql()
}

/** Refuses to start while `mailFeedback` is on and its table, or the unique index a write stands on, is missing; the project's migrations add them. */
export const checkMailFeedbackSchema = async (db: Db) => {
  const [unique] = indexes[0]
  if ((await hasTable(db)) && (await hasIndexes(db, feedbackSchema, 'feedback', [unique]))) return
  throw new Error(`The table ${feedbackTable} of mailFeedback, or its unique index ${unique}, is missing. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
