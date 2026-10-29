import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { migrationCommand } from '../changes/capture-schema'
import { quoteIdent } from '../changes/capture-sql'
import { changesSchema, type EventsOptions } from '../changes/events-options'
import { noticesTableSql } from '../live/notices-sql'

/**
 * - `calls`: a call on a record, by resource and encoded key: who started it, when, the latest it may end, and when it
 *   ended (NULL while it goes on). A record has at most one call going on. Its id is random, so it is unique beyond
 *   the app too, as the room of a media server other apps share.
 * - `members`: a member's time in a call, from their join until they left or were removed; the process that serves
 *   them and when it last heard of them. A removal of someone not in the call is a row that starts and ends at once.
 * - `signals`: with several processes, a member's description or candidate for a member another process serves,
 *   taken out by that process as it reads it, and deleted after a minute when no process did.
 * - `rings`: a user a call rang, by their id, with the ring's text, until when it rings, and when it stopped: they
 *   joined the call, declined, or the call ended.
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
create index if not exists "signals_at" on "calls"."signals" ("at");

create table if not exists "calls"."rings" (
  "call_id" uuid not null references "calls"."calls" ("id") on delete cascade,
  "user_id" text not null,
  "title" text not null,
  "body" text,
  "rung_at" timestamptz not null,
  "until" timestamptz not null,
  "stopped_at" timestamptz,
  primary key ("call_id", "user_id")
);
create index if not exists "rings_user" on "calls"."rings" ("user_id", "until") where "stopped_at" is null;
create index if not exists "rings_until" on "calls"."rings" ("until") where "stopped_at" is null;`

// Only reads the catalogue.
const hasCallsTables = async (db: Db) =>
  (await sql<{ found: boolean }>`select to_regclass('calls.calls') is not null and to_regclass('calls.members') is not null and to_regclass('calls.signals') is not null and to_regclass('calls.rings') is not null as found`.execute(db)).rows[0]!.found

// The live stream's notices, which tell open pages of the calls that ring their user.
const noticesTable = (events?: EventsOptions) => `${quoteIdent(changesSchema(events))}."notices"`

const hasNotices = async (db: Db, events?: EventsOptions) =>
  (await sql<{ found: boolean }>`select to_regclass(${noticesTable(events)}) is not null as found`.execute(db)).rows[0]!.found

/**
 * The SQL that adds the `calls` schema and its tables, and the changes schema's notices table rings reach open pages
 * through, `undefined` when they are there. They are never dropped.
 */
export const callsMigration = async (db: Db, events?: EventsOptions) => {
  const statements = [
    ...((await hasCallsTables(db)) ? [] : [callsSchemaSql]),
    ...((await hasNotices(db, events)) ? [] : [`create schema if not exists ${quoteIdent(changesSchema(events))}`, noticesTableSql(changesSchema(events))]),
  ]
  return statements.length === 0 ? undefined : `${statements.join(';\n\n')};`
}

/** Refuses to go on while the app has `calls` and the database lacks their tables; the project's migrations add them. */
export const checkCalls = async (db: Db, calls: unknown, events?: EventsOptions) => {
  if (!calls) return
  if ((await hasCallsTables(db)) && (await hasNotices(db, events))) return
  throw new Error(`The calls schema or the notices table that rings go through is missing. Write them as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
