import { quoteIdent } from '../changes/capture-sql'

/** Bumped whenever the tables, functions or indexes below change, so the next migration writes them again. */
export const workflowsVersion = 4

/** The comment the schema's function carries, which the startup check reads. */
export const workflowsComment = `Protobase workflows ${workflowsVersion}`

export const commentVersion = (comment: string | null) => {
  const match = comment?.match(/^Protobase workflows (\d+)$/)
  return match ? Number(match[1]) : undefined
}

const ms = (from: string, to: string) => `(floor(extract(epoch from ("${to}" - "${from}")) * 1000)::bigint)`

/**
 * The workflows, each version of their definitions as it was saved, and their runs. A run pins the version it started
 * on, and a run with a key is started once per workflow and key.
 */
export const tablesSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `create table if not exists ${s}."workflows" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "description" text,
  "definition" jsonb not null,
  "version" integer,
  "tenant_id" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists ${s}."versions" (
  "workflow_id" uuid not null references ${s}."workflows" ("id") on delete cascade,
  "version" integer not null,
  "definition" jsonb not null,
  "saved_by" text,
  "tenant_id" text,
  "saved_at" timestamptz not null default now(),
  primary key ("workflow_id", "version")
);

create table if not exists ${s}."runs" (
  "id" uuid primary key default gen_random_uuid(),
  "workflow_id" uuid not null references ${s}."workflows" ("id") on delete cascade,
  "version" integer,
  "input" jsonb,
  "key" text,
  "status" text not null default 'queued' check ("status" in ('queued', 'running', 'waiting', 'succeeded', 'failed')),
  "output" jsonb,
  "error" text,
  "cause" text,
  "resume_at" timestamptz,
  "started_by" text,
  "tenant_id" text,
  "created_at" timestamptz not null default now(),
  "finished_at" timestamptz,
  "duration_ms" bigint generated always as (${ms('created_at', 'finished_at')}) stored,
  foreign key ("workflow_id", "version") references ${s}."versions" ("workflow_id", "version")
)`
}

/**
 * Where each scope of a running run stands, its latest checkpoint only, all a later segment needs to go on; a run that
 * ends drops its rows. A checkpoint replaces its scope's only when that is the one it `follows`, which keeps a segment
 * that fell behind from saving. Its values are in `value` and `variables`, or, when large, in the run's file at `blob`.
 * Added to a schema made before, as are the run's trace setting and its trace's file.
 */
export const checkpointsSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `create table if not exists ${s}."checkpoints" (
  "run_id" uuid not null references ${s}."runs" ("id") on delete cascade,
  "scope" text not null,
  "seq" integer not null,
  "follows" integer not null,
  "state" text not null,
  "type" text not null,
  "status" text not null check ("status" in ('succeeded', 'retrying', 'caught', 'failed')),
  "fetched_at" timestamptz not null,
  "next" text,
  "value" jsonb,
  "variables" jsonb,
  "blob" text,
  "attempt" integer not null,
  "failures" jsonb not null,
  "resume_at" timestamptz,
  "clock" timestamptz not null,
  "error" text,
  "cause" text,
  primary key ("run_id", "scope")
);
alter table ${s}."runs" add column if not exists "trace" text check ("trace" in ('all', 'failed', 'none'));
alter table ${s}."runs" add column if not exists "trace_file" text`
}

/** An index for each filter and sort the API takes, and pg_trgm ones for the search over names. */
export const indexesSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `create extension if not exists pg_trgm;
create index if not exists "workflows_tenant" on ${s}."workflows" ("tenant_id");
create index if not exists "workflows_name" on ${s}."workflows" ("name");
create index if not exists "workflows_updated_at" on ${s}."workflows" ("updated_at");
create index if not exists "workflows_name_search" on ${s}."workflows" using gin ("name" gin_trgm_ops);
create index if not exists "versions_tenant" on ${s}."versions" ("tenant_id");
alter table ${s}."runs" add column if not exists "key" text;
create unique index if not exists "runs_key" on ${s}."runs" ("workflow_id", "key");
create index if not exists "runs_workflow" on ${s}."runs" ("workflow_id", "created_at");
create index if not exists "runs_tenant" on ${s}."runs" ("tenant_id");
create index if not exists "runs_status" on ${s}."runs" ("status");
create index if not exists "runs_created_at" on ${s}."runs" ("created_at")`
}

/** The triggers `functionsSql` makes, which the startup check finds on their tables. */
export const workflowsTriggers = ['workflow_version', 'run_version']

/**
 * A workflow numbers its next version as a save changes its definition, in the row the write returns, so its ETag is
 * the saved row's; the save hook keeps that version's definition and who saved it. A run takes its workflow's current
 * version as it is created, and refuses a workflow of another tenant as one that is not there, and one that has no
 * saved version.
 */
export const functionsSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `create or replace function ${s}."workflow_version"() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    return new;
  end if;
  -- The write holds the row, so a save in another transaction numbers its version after this one.
  new.version := case when new.definition is distinct from old.definition then coalesce(old.version, 0) + 1 else old.version end;
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists "workflow_version" on ${s}."workflows";
create trigger "workflow_version" before insert or update on ${s}."workflows" for each row execute function ${s}."workflow_version"();

create or replace function ${s}."run_version"() returns trigger
language plpgsql as $$
declare
  found record;
begin
  select w.id, w.version, w.tenant_id into found from ${s}."workflows" w where w.id = new.workflow_id;
  -- Another tenant's workflow is refused as one that is not there, so a start tells nothing of other tenants.
  if found.id is null or new.tenant_id is distinct from found.tenant_id then
    raise exception 'There is no workflow % here', new.workflow_id using errcode = '23503';
  end if;
  if found.version is null then
    raise exception 'Workflow % has no saved version', new.workflow_id using errcode = '23503';
  end if;
  new.version := found.version;
  return new;
end
$$;
comment on function ${s}."run_version"() is '${workflowsComment}';
drop trigger if exists "run_version" on ${s}."runs";
create trigger "run_version" before insert on ${s}."runs" for each row execute function ${s}."run_version"()`
}
