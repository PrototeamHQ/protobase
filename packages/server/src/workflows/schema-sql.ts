import { quoteIdent } from '../changes/capture-sql'

/** Bumped whenever the tables, functions or indexes below change, so the next migration writes them again. */
export const workflowsVersion = 18

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
  "rerun_of" uuid references ${s}."runs" ("id") on delete set null,
  "replay" boolean,
  "rerun_from" text,
  "tenant_id" text,
  "created_at" timestamptz not null default now(),
  "finished_at" timestamptz,
  "duration_ms" bigint generated always as (${ms('created_at', 'finished_at')}) stored,
  foreign key ("workflow_id", "version") references ${s}."versions" ("workflow_id", "version")
)`
}

/**
 * Where each scope of a run stands, its latest checkpoint only, all a later segment needs to go on; a run that succeeds
 * drops its rows, and one that fails keeps them for a re-run. A checkpoint replaces its scope's only when that is the
 * one it `follows`, which keeps a segment that fell behind from saving. Added to a schema made before, as are the run's
 * trace setting and its trace's file.
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
  "status" text not null check ("status" in ('succeeded', 'retrying', 'caught')),
  "fetched_at" timestamptz not null,
  "next" text,
  "value" jsonb,
  "variables" jsonb not null,
  "attempt" integer not null,
  "failures" jsonb not null,
  "visits" jsonb not null,
  "resume_at" timestamptz,
  "clock" timestamptz not null,
  primary key ("run_id", "scope")
);
alter table ${s}."runs" add column if not exists "trace" text check ("trace" in ('all', 'failed', 'none'));
alter table ${s}."runs" add column if not exists "trace_file" text`
}

/** The most bytes a trigger's cursor or store holds as JSON, so a plugin cannot grow them without limit. */
export const triggerStateBytes = 64 * 1024

/**
 * Which version of a workflow is on (`enabled_version`, null when off), and one row per trigger of an enabled version:
 * its type and input, and the state its kind keeps. A change raises `generation`, so a job queued for an older one
 * ends without acting. A poll or renewal acts only as the job `poll_job_id` names, on the try `poll_attempt` claimed,
 * so a try that ran past its timeout writes nothing once its retry claimed the trigger. A deleted workflow leaves its
 * trigger without a workflow, which its delete hook stops. A trigger being stopped stays `stopping` until its stop job removes it. Written whole each time:
 * every statement is idempotent.
 */
export const triggersSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `alter table ${s}."workflows" add column if not exists "enabled_version" integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workflows_enabled_version' and connamespace = ${`'${schema.replaceAll("'", "''")}'`}::regnamespace) then
    alter table ${s}."workflows" add constraint "workflows_enabled_version" foreign key ("id", "enabled_version") references ${s}."versions" ("workflow_id", "version") deferrable initially deferred;
  end if;
end $$;
-- Who turned the version on, signed in as themselves: the consent its runs sign in through their connections with.
alter table ${s}."versions" add column if not exists "enabled_by" text;
create table if not exists ${s}."triggers" (
  "id" uuid primary key default gen_random_uuid(),
  "workflow_id" uuid references ${s}."workflows" ("id") on delete set null,
  "version" integer not null,
  "tenant_id" text,
  "type" text not null,
  "input" jsonb not null,
  "connection_id" text,
  "status" text not null check ("status" in ('active', 'failing', 'needs_sign_in', 'stopping')),
  "generation" integer not null,
  "cursor" jsonb check (octet_length("cursor"::text) <= ${triggerStateBytes}),
  "store" jsonb check (octet_length("store"::text) <= ${triggerStateBytes}),
  "poll_job_id" text,
  "poll_attempt" integer,
  "consecutive_failures" integer not null,
  "last_error" jsonb,
  "next_poll_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
alter table ${s}."triggers" add column if not exists "poll_attempt" integer;
-- Who turned the trigger's version on: the only person whose account its stop job ends the subscription through.
alter table ${s}."triggers" add column if not exists "enabled_by" text;
-- A deleted workflow's trigger stays, without its workflow, until its stop job unsubscribed it at its provider.
alter table ${s}."triggers" alter column "workflow_id" drop not null;
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'triggers_workflow_id_fkey' and confdeltype = 'c' and connamespace = ${`'${schema.replaceAll("'", "''")}'`}::regnamespace) then
    alter table ${s}."triggers" drop constraint "triggers_workflow_id_fkey";
    alter table ${s}."triggers" add constraint "triggers_workflow_id_fkey" foreign key ("workflow_id") references ${s}."workflows" ("id") on delete set null;
  end if;
end $$;
create unique index if not exists "triggers_workflow" on ${s}."triggers" ("workflow_id") where "status" <> 'stopping';
create index if not exists "triggers_workflow_id" on ${s}."triggers" ("workflow_id");
create index if not exists "triggers_updated_at" on ${s}."triggers" ("updated_at");
create index if not exists "triggers_status_type" on ${s}."triggers" ("status", "type");
create index if not exists "triggers_connection" on ${s}."triggers" ("connection_id");
create index if not exists "triggers_tenant" on ${s}."triggers" ("tenant_id")`
}

/**
 * What a step that changes records kept under its idempotency key, written with its records, so a retry of the step
 * after they committed writes nothing and returns them. Its rows go with their run.
 */
export const effectsSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `create table if not exists ${s}."effects" (
  "run_id" uuid not null references ${s}."runs" ("id") on delete cascade,
  "key" text not null,
  "result" jsonb,
  primary key ("run_id", "key")
)`
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
create index if not exists "versions_version" on ${s}."versions" ("version");
alter table ${s}."runs" add column if not exists "key" text;
create unique index if not exists "runs_key" on ${s}."runs" ("workflow_id", "key");
alter table ${s}."runs" add column if not exists "rerun_of" uuid references ${s}."runs" ("id") on delete set null;
create index if not exists "runs_rerun_of" on ${s}."runs" ("rerun_of");
alter table ${s}."runs" add column if not exists "replay" boolean;
create index if not exists "runs_workflow" on ${s}."runs" ("workflow_id", "created_at");
create index if not exists "runs_tenant" on ${s}."runs" ("tenant_id");
create index if not exists "runs_status" on ${s}."runs" ("status");
create index if not exists "runs_created_at" on ${s}."runs" ("created_at")`
}

// The columns the status triggers write, which leave a workflow's updated_at as it is.
const statusColumns = `array['run_status', 'status_run_id', 'status_run_at', 'unresolved_failures', 'resolved_at', 'resolved_by', 'updated_at']`

/** The triggers `functionsSql` makes, which the startup check finds on their tables. */
export const workflowsTriggers = ['workflow_version', 'run_version']

/**
 * A workflow numbers its next version as a save changes its definition, in the row the write returns, so its ETag is
 * the saved row's; the save hook keeps that version's definition and who saved it, and publishes only as `enabled_version`
 * is written. A run takes the version it names as it is created, else the published one, or the one saved last on a workflow
 * that is off, and refuses a workflow of another tenant as one that is not there, one that has no saved version, and a
 * version the workflow does not have. A re-run takes the input of the run it re-runs, which the start hook checks; a replay
 * too; both run the version saved last unless they name one. A workflow is created with no steps unless it says otherwise;
 * such a version is kept but runs nothing.
 */
export const functionsSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `alter table ${s}."runs" add column if not exists "rerun_from" text;

alter table ${s}."workflows" alter column "definition" set default '{"trigger":{"manual":{}},"stateMachine":{"QueryLanguage":"JSONata","StartAt":"","States":{}}}'::jsonb;

create or replace function ${s}."workflow_version"() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    return new;
  end if;
  -- The write holds the row, so a save in another transaction numbers its version after this one.
  new.version := case when new.definition is distinct from old.definition then coalesce(old.version, 0) + 1 else old.version end;
  -- Its status, which runs ending and marks as resolved write, is no change to the workflow itself.
  -- Otherwise never the same twice, nor now(): two writes in one transaction, as a batch that saves and publishes, are two ETags.
  if to_jsonb(new) - ${statusColumns} is distinct from to_jsonb(old) - ${statusColumns} then
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
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
  select w.id, w.version, w.enabled_version, w.tenant_id into found from ${s}."workflows" w where w.id = new.workflow_id;
  -- Another tenant's workflow is refused as one that is not there, so a start tells nothing of other tenants.
  if found.id is null or new.tenant_id is distinct from found.tenant_id then
    raise exception 'There is no workflow % here', new.workflow_id using errcode = '23503';
  end if;
  if found.version is null then
    raise exception 'Workflow % has no saved version', new.workflow_id using errcode = '23503';
  end if;
  if new.version is not null and not exists (select from ${s}."versions" v where v.workflow_id = new.workflow_id and v.version = new.version) then
    raise exception 'Workflow % has no version %', new.workflow_id, new.version using errcode = '23503';
  end if;
  -- A replay replays a run of this workflow and tenant.
  if new.replay then
    if not exists (select from ${s}."runs" r
      where r.id = new.rerun_of and r.workflow_id = new.workflow_id and r.tenant_id is not distinct from new.tenant_id) then
      raise exception 'There is no run % of workflow % here to replay', new.rerun_of, new.workflow_id using errcode = '23503';
    end if;
  end if;
  -- A re-run or a replay tries a fix, so it runs the version saved last. Any other start not naming its version runs
  -- what is published, so a saved change stays out of production until it is, or the version saved last on a workflow that is off.
  if new.version is null then
    new.version := case when new.rerun_of is null then coalesce(found.enabled_version, found.version) else found.version end;
  end if;
  -- Checked on the version the run takes, which a re-run or a replay takes otherwise than a start
  if exists (select from ${s}."versions" v where v.workflow_id = new.workflow_id and v.version = new.version and v.definition -> 'stateMachine' -> 'States' = '{}'::jsonb) then
    raise exception 'Workflow % has no steps to run', new.workflow_id using errcode = '23503';
  end if;
  if new.rerun_of is not null then
    select r.input into new.input from ${s}."runs" r where r.id = new.rerun_of and r.workflow_id = new.workflow_id;
  end if;
  return new;
end
$$;
comment on function ${s}."run_version"() is '${workflowsComment}';
drop trigger if exists "run_version" on ${s}."runs";
create trigger "run_version" before insert on ${s}."runs" for each row execute function ${s}."run_version"()`
}
