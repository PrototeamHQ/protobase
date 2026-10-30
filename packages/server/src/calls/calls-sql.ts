import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { migrationCommand } from '../changes/capture-schema'
import { quoteIdent } from '../changes/capture-sql'
import { changesSchema, type EventsOptions } from '../changes/events-options'
import { noticesTableSql } from '../live/notices-sql'

/**
 * - `members.name`: the name a guest gave; NULL for the app's members, whom the app names.
 * - `guest_links`: a link that lets guests into one call, by the SHA-256 of its token: the member who made it, the
 *   organization of the call's record (NULL in an app without organizations), what a guest may send, until when it
 *   lets guests in (NULL: until the call ends) and when it was revoked.
 * - `guests`: someone who came in through a link, by the SHA-256 of their token, with the name they gave; `admitted`
 *   NULL while they wait, then whether a member let them in, who and when. They are member `guest:<id>` in the call.
 * - `organization_guests`: whether an organization's admin allows guest links to its calls; no row allows them.
 */
export const guestsSchemaSql = `alter table "calls"."members" add column if not exists "name" text;

create table if not exists "calls"."guest_links" (
  "id" uuid primary key,
  "call_id" uuid not null references "calls"."calls" ("id") on delete cascade,
  "token_hash" bytea not null unique,
  "created_by" text not null,
  "organization_id" text,
  "publish" jsonb not null,
  "created_at" timestamptz not null,
  "expires_at" timestamptz,
  "revoked_at" timestamptz
);
create index if not exists "guest_links_call" on "calls"."guest_links" ("call_id");
create index if not exists "guest_links_organization" on "calls"."guest_links" ("organization_id") where "revoked_at" is null;

create table if not exists "calls"."guests" (
  "id" uuid primary key,
  "link_id" uuid not null references "calls"."guest_links" ("id") on delete cascade,
  "call_id" uuid not null references "calls"."calls" ("id") on delete cascade,
  "name" text not null,
  "token_hash" bytea not null unique,
  "entered_at" timestamptz not null,
  "seen_at" timestamptz not null,
  "admitted" boolean,
  "decided_by" text,
  "decided_at" timestamptz
);
create index if not exists "guests_waiting" on "calls"."guests" ("call_id") where "admitted" is null;
create index if not exists "guests_link" on "calls"."guests" ("link_id");

create table if not exists "calls"."organization_guests" (
  "organization_id" text primary key,
  "allowed" boolean not null,
  "set_by" text not null,
  "set_at" timestamptz not null
);`

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
 * - The guest tables, see `guestsSchemaSql`.
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
create index if not exists "rings_until" on "calls"."rings" ("until") where "stopped_at" is null;

${guestsSchemaSql}`


// Only reads the catalogue.
const hasCallsTables = async (db: Db) =>
  (await sql<{ found: boolean }>`select to_regclass('calls.calls') is not null and to_regclass('calls.members') is not null and to_regclass('calls.signals') is not null and to_regclass('calls.rings') is not null as found`.execute(db)).rows[0]!.found

// Only reads the catalogue.
const hasGuestTables = async (db: Db) =>
  (
    await sql<{ found: boolean }>`select to_regclass('calls.guest_links') is not null and to_regclass('calls.guests') is not null and to_regclass('calls.organization_guests') is not null
      and exists (select from information_schema.columns where table_schema = 'calls' and table_name = 'members' and column_name = 'name') as found`.execute(db)
  ).rows[0]!.found

// The live stream's notices, which tell open pages of the calls that ring their user.
const noticesTable = (events?: EventsOptions) => `${quoteIdent(changesSchema(events))}."notices"`

const hasNotices = async (db: Db, events?: EventsOptions) =>
  (await sql<{ found: boolean }>`select to_regclass(${noticesTable(events)}) is not null as found`.execute(db)).rows[0]!.found

/**
 * The SQL that adds the `calls` schema and its tables, or the guest tables to a calls schema without them, and the changes schema's notices table rings reach open pages
 * through, `undefined` when they are there. They are never dropped.
 */
export const callsMigration = async (db: Db, events?: EventsOptions) => {
  const statements = [
    ...((await hasCallsTables(db)) ? ((await hasGuestTables(db)) ? [] : [guestsSchemaSql]) : [callsSchemaSql]),
    ...((await hasNotices(db, events)) ? [] : [`create schema if not exists ${quoteIdent(changesSchema(events))}`, noticesTableSql(changesSchema(events))]),
  ]
  return statements.length === 0 ? undefined : `${statements.join(';\n\n')};`
}

/** Refuses to go on while the app has `calls` and the database lacks their tables; the project's migrations add them. */
export const checkCalls = async (db: Db, calls: unknown, events?: EventsOptions) => {
  if (!calls) return
  if ((await hasCallsTables(db)) && (await hasGuestTables(db)) && (await hasNotices(db, events))) return
  throw new Error(`The calls schema or the notices table that rings go through is missing. Write them as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
