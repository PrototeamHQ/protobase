create schema if not exists realtime_relay;

create table if not exists realtime_relay.frames (
  id bigint generated always as identity primary key,
  process uuid not null,
  kind text not null check (kind in ('broadcast', 'presence')),
  topic text not null,
  private boolean not null,
  space text not null default 'topics' check (space in ('topics', 'records')),
  event text,
  payload json,
  bytes bytea,
  meta json,
  at timestamptz not null default now()
);

create index if not exists frames_at on realtime_relay.frames (at);

create table if not exists realtime_relay.processes (
  id uuid primary key,
  seen_at timestamptz not null default now()
);

create table if not exists realtime_relay.presences (
  process uuid not null,
  ref text not null,
  topic text not null,
  private boolean not null,
  space text not null default 'topics' check (space in ('topics', 'records')),
  key text not null,
  meta json not null,
  primary key (process, ref)
);

create table if not exists realtime_relay.rates (
  topic text primary key,
  second bigint not null,
  count integer not null
);

-- A relay schema written before the record channels gets the column too.
alter table realtime_relay.frames add column if not exists space text not null default 'topics' check (space in ('topics', 'records'));
alter table realtime_relay.presences add column if not exists space text not null default 'topics' check (space in ('topics', 'records'));
