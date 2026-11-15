import { quoteIdent } from '../changes/capture-sql'

/**
 * Each try of a Task that waits for an outside result (`visit`) of a run: its token's SHA-256 (`token_hash`), never the
 * token, with when it started, its deadline and heartbeat, and once handed off, what the hand-off recorded with the token
 * blanked out. It is `waiting` until an answer or the Task's end settles it, and goes with its run. Only the engine
 * writes it, and no resource reads it. Every statement is idempotent.
 */
export const taskTokensSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `create table if not exists ${s}."task_tokens" (
  "run_id" uuid not null references ${s}."runs" ("id") on delete cascade,
  "visit" text not null,
  "state" text not null,
  "token_hash" text not null unique,
  "status" text not null default 'waiting' check ("status" in ('waiting', 'succeeded', 'failed')),
  "started_at" timestamptz not null,
  "handed_off_at" timestamptz,
  "deadline" timestamptz not null,
  "heartbeat_seconds" integer,
  "heartbeat_at" timestamptz,
  "input" jsonb,
  "logs" jsonb not null default '[]'::jsonb,
  "output" jsonb,
  "error" text,
  "cause" text,
  "answered_at" timestamptz,
  primary key ("run_id", "visit")
)`
}
