import { quoteIdent } from '../changes/capture-sql'

/**
 * A block's run: a run of its own the engine starts for one try of a Block (`block_visit`) of the run `block_of`,
 * running that Block's processor (`block_state`) of the same version; a replay or re-run of it keeps `block_state` and
 * runs alone. Only the engine writes these columns, which the API keeps read-only. `output_blanked` says the output held
 * a secret, so no Block keeps it. Every statement is idempotent.
 */
export const blockRunsSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `alter table ${s}."runs" add column if not exists "block_of" uuid references ${s}."runs" ("id") on delete set null;
alter table ${s}."runs" add column if not exists "block_state" text;
alter table ${s}."runs" add column if not exists "block_visit" text;
alter table ${s}."runs" add column if not exists "output_blanked" boolean;
create index if not exists "runs_block_of" on ${s}."runs" ("block_of");
create unique index if not exists "runs_block_visit" on ${s}."runs" ("block_of", "block_visit") where "block_of" is not null`
}
