import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { migrationCommand } from '../changes/capture-schema'

/**
 * - `calls`: a call on a record, by resource and encoded key: who started it, when, the latest it may end, and when it
 *   ended (NULL while it goes on). A record has at most one call going on. Its id is random, so it is unique beyond
 *   the app too, as the room of a media server other apps share.
 * - `members`: a member's time in a call, from their join until they left or were removed; the process that serves
 *   them and when it last heard of them. A removal of someone not in the call is a row that starts and ends at once.
 * - `signals`: with several processes, a member's description or candidate for a member another process serves,
 *   taken out by that process as it reads it, and deleted after a minute when no process did.
 */
export const callsSchemaSql = `create schema if not exists "calls";

create table if not exists "calls"."calls" (
  "id" uuid primary key,
  "resource" text not null,
  "record_key" text not null,
  "started_by" text not null,
  "started_at" timestamptz not null,
  "ends_at" timestamptz not null,
  "ended_at" timestamptz
);
create unique index if not exists "calls_live" on "calls"."calls" ("resource", "record_key") where "ended_at" is null;
create index if not exists "calls_record" on "calls"."calls" ("resource", "record_key", "started_at");

create table if not exists "calls"."members" (
  "id" bigint generated always as identity primary key,
  "call_id" uuid not null references "calls"."calls" ("id") on delete cascade,
  "member" text not null,
  "process" uuid not null,
  "tracks" jsonb not null,
  "joined_at" timestamptz not null,
  "seen_at" timestamptz not null,
  "left_at" timestamptz,
  "removed_at" timestamptz
);
create unique index if not exists "members_present" on "calls"."members" ("call_id", "member") where "left_at" is null;
create index if not exists "members_call" on "calls"."members" ("call_id", "member");
create index if not exists "members_seen" on "calls"."members" ("seen_at") where "left_at" is null;

create table if not exists "calls"."signals" (
  "id" bigint generated always as identity primary key,
  "process" uuid not null,
  "call_id" uuid not null,
  "to_member" text not null,
  "from_member" text not null,
  "body" json not null,
  "at" timestamptz not null
);
create index if not exists "signals_process" on "calls"."signals" ("process", "id");
create index if not exists "signals_at" on "calls"."signals" ("at");`

// Only reads the catalogue.
const hasCallsTables = async (db: Db) =>
  (await sql<{ found: boolean }>`select to_regclass('calls.calls') is not null and to_regclass('calls.members') is not null and to_regclass('calls.signals') is not null as found`.execute(db)).rows[0]!.found

/** The SQL that adds the `calls` schema and its tables, `undefined` when they are there. They are never dropped. */
export const callsMigration = async (db: Db) => {
  if (await hasCallsTables(db)) return undefined
  return `${callsSchemaSql};`
}

/** Refuses to go on while the app has `calls` and the database lacks their tables; the project's migrations add them. */
export const checkCalls = async (db: Db, calls: unknown) => {
  if (!calls) return
  if (await hasCallsTables(db)) return
  throw new Error(`The calls schema is missing, and calls keep their records in it. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
