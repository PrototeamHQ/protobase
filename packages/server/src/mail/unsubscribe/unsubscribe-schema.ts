import { unsubscribesSchema, unsubscribesTable } from './unsubscribe-store'

/** The table's indexes by name: the unique one the send's check and the admin list's recipient filter read, and the list's topic filter and sort. */
export const unsubscribesIndexes = [
  ['unsubscribes_recipient_topic', 'unique', '"recipient", "topic"'],
  ['unsubscribes_topic', '', '"topic"'],
  ['unsubscribes_created_at', '', '"created_at"'],
] as const

// Step 1 of `unsubscribesModule`: frozen once released, as every step is.
/** A row per recipient, lower-cased, and topic they unsubscribed from, with when. */
export const unsubscribesTableSql = () => `create schema if not exists "${unsubscribesSchema}";

create table if not exists ${unsubscribesTable} (
  "id" bigint generated always as identity primary key,
  "recipient" text not null check ("recipient" = lower("recipient")),
  "topic" text not null,
  "created_at" timestamptz not null
);

${unsubscribesIndexes.map(([name, kind, columns]) => `create ${kind ? `${kind} ` : ''}index if not exists "${name}" on ${unsubscribesTable} (${columns});`).join('\n')}`
