// The record of the migrations applied to the database, one row each, which every migration Protobase writes inserts
// as its last statement, so a project's own runner records it too. The server reads it once at startup.

export const recordSchema = 'migrations'
export const recordTable = `${recordSchema}.history`

/** The statements that make the record, each only when missing. */
export const recordTableSql = `create schema if not exists ${recordSchema};
create table if not exists ${recordTable} (
  id text primary key,
  number integer,
  name text not null,
  protobase_version text not null,
  model jsonb not null,
  model_hash text not null,
  physical jsonb not null,
  additive boolean,
  sql_hash text,
  applied_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
create index if not exists history_applied_at on ${recordTable} (applied_at);`

/** An index a migration's `.after.sql` builds, which is unfinished until its `completed_at` is set. */
export type AfterIndex = { index: string; unique: boolean }
