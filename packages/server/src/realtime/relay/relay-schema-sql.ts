/** The schema that carries broadcasts and presence between the processes serving an app. */
export const relaySchema = 'realtime_relay'

/** The tables the relay needs; `json`, not `jsonb`, so a payload reaches the other processes as it was sent. */
export const relayTables = ['frames', 'presences', 'processes', 'rates'] as const

/**
 * Which channels a frame or presence is of: `topics`, those of `/api/sb/realtime/v1`, named by any topic, or `records`,
 * those of `/api/channels`, named by a record. The two never hear each other, whatever their topics.
 */
export type RelaySpace = 'topics' | 'records'

/** The tables with a `space` column, which a relay schema written before it lacks. */
export const spacedTables = ['frames', 'presences'] as const

/**
 * - `frames`: what a process sends, a broadcast or a presence diff, read by the others and pruned after a minute.
 * - `space` in `frames` and `presences`: the channels they are of (`RelaySpace`).
 * - `presences`: what each process's channels track, which a process that starts reads.
 * - `processes`: each process's last heartbeat; a process silent too long has its presences removed.
 * - `rates`: each topic's broadcasts in the current second, every process's together.
 */
export const relaySchemaSql = `create schema if not exists ${relaySchema};

create table if not exists ${relaySchema}.frames (
  id bigint generated always as identity primary key,
  process uuid not null,
  kind text not null check (kind in ('broadcast', 'presence')),
  topic text not null,
  private boolean not null,
  space text not null check (space in ('topics', 'records')),
  event text,
  payload json,
  bytes bytea,
  meta json,
  at timestamptz not null default now()
);

create index if not exists frames_at on ${relaySchema}.frames (at);

create table if not exists ${relaySchema}.processes (
  id uuid primary key,
  seen_at timestamptz not null default now()
);

create table if not exists ${relaySchema}.presences (
  process uuid not null,
  ref text not null,
  topic text not null,
  private boolean not null,
  space text not null check (space in ('topics', 'records')),
  key text not null,
  meta json not null,
  primary key (process, ref)
);

create table if not exists ${relaySchema}.rates (
  topic text primary key,
  second bigint not null,
  count integer not null
);

-- A relay schema written before the record channels: what was in it, and what a process of the version before still
-- writes while the new one starts, is the topics'.
${spacedTables.map((table) => `alter table ${relaySchema}.${table} add column if not exists space text not null default 'topics' check (space in ('topics', 'records'));`).join('\n')}`
