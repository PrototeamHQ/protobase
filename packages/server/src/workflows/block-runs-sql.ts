import { quoteIdent } from '../changes/capture-sql'

/**
 * A block's run: a run of its own the engine starts for one try of a Block (`block_visit`) of the run `block_of`,
 * running that Block's processor (`block_state`) of the same version; a replay or re-run of it keeps `block_state` and
 * runs alone. Only the engine writes these columns, which the API keeps read-only. `output_blanked` says the output held
 * a secret, so no Block keeps it. A run another run may join keeps its Block's cache key (`block_key`, a digest) and a
 * digest of the identity its result is kept under (`block_who`), one such run per key and identity under way at a time;
 * `block_waiters` holds each try of a Block (`parent`, `visit`) that joined one. Every statement is idempotent.
 */
export const blockRunsSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `alter table ${s}."runs" add column if not exists "block_of" uuid references ${s}."runs" ("id") on delete set null;
alter table ${s}."runs" add column if not exists "block_state" text;
alter table ${s}."runs" add column if not exists "block_visit" text;
alter table ${s}."runs" add column if not exists "output_blanked" boolean;
create index if not exists "runs_block_of" on ${s}."runs" ("block_of");
create unique index if not exists "runs_block_visit" on ${s}."runs" ("block_of", "block_visit") where "block_of" is not null;
alter table ${s}."runs" add column if not exists "block_key" text;
alter table ${s}."runs" add column if not exists "block_who" text;
alter table ${s}."runs" drop constraint if exists "runs_block_shared";
alter table ${s}."runs" add constraint "runs_block_shared" check (("block_key" is null) = ("block_who" is null));
create unique index if not exists "runs_block_in_flight" on ${s}."runs" ("block_key", "block_who") where "block_key" is not null and "block_who" is not null and "status" in ('queued', 'running', 'waiting');
create table if not exists ${s}."block_waiters" (
  "parent" uuid not null references ${s}."runs" ("id") on delete cascade,
  "visit" text not null,
  "run_id" uuid not null references ${s}."runs" ("id") on delete cascade,
  primary key ("parent", "visit")
);
create index if not exists "block_waiters_run" on ${s}."block_waiters" ("run_id")`
}
