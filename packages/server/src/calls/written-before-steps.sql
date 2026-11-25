create schema if not exists "calls";

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

alter table "calls"."members" add column if not exists "name" text;

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
);

create schema if not exists "changes";

create table if not exists "changes"."notices" (
  "id" bigint generated always as identity primary key,
  "resource" text not null,
  "record_key" text not null,
  "tenant_id" text,
  "operation" text not null check ("operation" in ('create', 'update', 'delete', 'undelete')),
  "at" timestamptz not null default now()
);
create index if not exists "notices_at" on "changes"."notices" ("at");
