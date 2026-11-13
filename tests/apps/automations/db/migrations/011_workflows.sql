-- The workflows, their versions, runs and steps, written by `protobase migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

create schema if not exists "workflows";

create table if not exists "workflows"."workflows" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "description" text,
  "definition" jsonb not null,
  "version" integer,
  "tenant_id" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "workflows"."versions" (
  "workflow_id" uuid not null references "workflows"."workflows" ("id") on delete cascade,
  "version" integer not null,
  "definition" jsonb not null,
  "saved_by" text,
  "tenant_id" text,
  "saved_at" timestamptz not null default now(),
  primary key ("workflow_id", "version")
);

create table if not exists "workflows"."runs" (
  "id" uuid primary key default gen_random_uuid(),
  "workflow_id" uuid not null references "workflows"."workflows" ("id") on delete cascade,
  "version" integer,
  "input" jsonb,
  "key" text,
  "status" text not null default 'queued' check ("status" in ('queued', 'running', 'waiting', 'succeeded', 'failed')),
  "output" jsonb,
  "error" text,
  "cause" text,
  "resume_at" timestamptz,
  "started_by" text,
  "rerun_of" uuid references "workflows"."runs" ("id") on delete set null,
  "replay" boolean,
  "rerun_from" text,
  "tenant_id" text,
  "created_at" timestamptz not null default now(),
  "finished_at" timestamptz,
  "duration_ms" bigint generated always as ((floor(extract(epoch from ("finished_at" - "created_at")) * 1000)::bigint)) stored,
  foreign key ("workflow_id", "version") references "workflows"."versions" ("workflow_id", "version")
);

create table if not exists "workflows"."checkpoints" (
  "run_id" uuid not null references "workflows"."runs" ("id") on delete cascade,
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
alter table "workflows"."runs" add column if not exists "trace" text check ("trace" in ('all', 'failed', 'none'));
alter table "workflows"."runs" add column if not exists "trace_file" text;

drop table if exists "workflows"."steps";

alter table "workflows"."workflows" add column if not exists "enabled_version" integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workflows_enabled_version' and connamespace = 'workflows'::regnamespace) then
    alter table "workflows"."workflows" add constraint "workflows_enabled_version" foreign key ("id", "enabled_version") references "workflows"."versions" ("workflow_id", "version") deferrable initially deferred;
  end if;
end $$;
-- Who turned the version on, signed in as themselves: the consent its runs sign in through their connections with.
alter table "workflows"."versions" add column if not exists "enabled_by" text;
create table if not exists "workflows"."triggers" (
  "id" uuid primary key default gen_random_uuid(),
  "workflow_id" uuid references "workflows"."workflows" ("id") on delete set null,
  "version" integer not null,
  "tenant_id" text,
  "type" text not null,
  "input" jsonb not null,
  "connection_id" text,
  "status" text not null check ("status" in ('active', 'failing', 'needs_sign_in', 'stopping')),
  "generation" integer not null,
  "cursor" jsonb check (octet_length("cursor"::text) <= 65536),
  "store" jsonb check (octet_length("store"::text) <= 65536),
  "poll_job_id" text,
  "poll_attempt" integer,
  "consecutive_failures" integer not null,
  "last_error" jsonb,
  "next_poll_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
alter table "workflows"."triggers" add column if not exists "poll_attempt" integer;
-- Who turned the trigger's version on: the only person whose account its stop job ends the subscription through.
alter table "workflows"."triggers" add column if not exists "enabled_by" text;
-- A deleted workflow's trigger stays, without its workflow, until its stop job unsubscribed it at its provider.
alter table "workflows"."triggers" alter column "workflow_id" drop not null;
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'triggers_workflow_id_fkey' and confdeltype = 'c' and connamespace = 'workflows'::regnamespace) then
    alter table "workflows"."triggers" drop constraint "triggers_workflow_id_fkey";
    alter table "workflows"."triggers" add constraint "triggers_workflow_id_fkey" foreign key ("workflow_id") references "workflows"."workflows" ("id") on delete set null;
  end if;
end $$;
create unique index if not exists "triggers_workflow" on "workflows"."triggers" ("workflow_id") where "status" <> 'stopping';
create index if not exists "triggers_workflow_id" on "workflows"."triggers" ("workflow_id");
create index if not exists "triggers_updated_at" on "workflows"."triggers" ("updated_at");
create index if not exists "triggers_status_type" on "workflows"."triggers" ("status", "type");
create index if not exists "triggers_connection" on "workflows"."triggers" ("connection_id");
create index if not exists "triggers_tenant" on "workflows"."triggers" ("tenant_id");

create table if not exists "workflows"."effects" (
  "run_id" uuid not null references "workflows"."runs" ("id") on delete cascade,
  "key" text not null,
  "result" jsonb,
  primary key ("run_id", "key")
);

create table if not exists "workflows"."connection_revocations" (
  "id" uuid primary key default gen_random_uuid(),
  "provider" text not null,
  "hint" text not null check ("hint" in ('refresh_token', 'access_token')),
  "token" text not null,
  "created_at" timestamptz not null default now()
);

create table if not exists "workflows"."hooks" (
  "workflow_id" uuid primary key references "workflows"."workflows" ("id") on delete cascade,
  "key_hash" text not null unique,
  "secret" text,
  "secret_hash" text not null,
  "tenant_id" text,
  "created_at" timestamptz not null default now()
);

create table if not exists "workflows"."step_cache" (
  "type" text not null,
  "key" text not null,
  "who" jsonb not null,
  "tenant_id" text,
  "output" jsonb,
  "secrets" jsonb not null,
  "cached_at" timestamptz not null default now(),
  "expires_at" timestamptz not null,
  primary key ("type", "key", "who")
);
create index if not exists "step_cache_expires" on "workflows"."step_cache" ("type", "tenant_id", "expires_at");
create table if not exists "workflows"."step_cache_shapes" (
  "type" text not null,
  "shape" jsonb not null,
  primary key ("type", "shape")
);

create extension if not exists pg_trgm;
create index if not exists "workflows_tenant" on "workflows"."workflows" ("tenant_id");
create index if not exists "workflows_name" on "workflows"."workflows" ("name");
create index if not exists "workflows_updated_at" on "workflows"."workflows" ("updated_at");
create index if not exists "workflows_name_search" on "workflows"."workflows" using gin ("name" gin_trgm_ops);
create index if not exists "versions_tenant" on "workflows"."versions" ("tenant_id");
create index if not exists "versions_version" on "workflows"."versions" ("version");
alter table "workflows"."runs" add column if not exists "key" text;
create unique index if not exists "runs_key" on "workflows"."runs" ("workflow_id", "key");
alter table "workflows"."runs" add column if not exists "rerun_of" uuid references "workflows"."runs" ("id") on delete set null;
create index if not exists "runs_rerun_of" on "workflows"."runs" ("rerun_of");
alter table "workflows"."runs" add column if not exists "replay" boolean;
create index if not exists "runs_workflow" on "workflows"."runs" ("workflow_id", "created_at");
create index if not exists "runs_tenant" on "workflows"."runs" ("tenant_id");
create index if not exists "runs_status" on "workflows"."runs" ("status");
create index if not exists "runs_created_at" on "workflows"."runs" ("created_at");

alter table "workflows"."runs" add column if not exists "block_of" uuid references "workflows"."runs" ("id") on delete set null;
alter table "workflows"."runs" add column if not exists "block_state" text;
alter table "workflows"."runs" add column if not exists "block_visit" text;
alter table "workflows"."runs" add column if not exists "output_blanked" boolean;
create index if not exists "runs_block_of" on "workflows"."runs" ("block_of");
create unique index if not exists "runs_block_visit" on "workflows"."runs" ("block_of", "block_visit") where "block_of" is not null;
alter table "workflows"."runs" add column if not exists "block_key" text;
alter table "workflows"."runs" add column if not exists "block_who" text;
alter table "workflows"."runs" drop constraint if exists "runs_block_shared";
alter table "workflows"."runs" add constraint "runs_block_shared" check (("block_key" is null) = ("block_who" is null));
create unique index if not exists "runs_block_in_flight" on "workflows"."runs" ("block_key", "block_who") where "block_key" is not null and "block_who" is not null and "status" in ('queued', 'running', 'waiting');
create table if not exists "workflows"."block_waiters" (
  "parent" uuid not null references "workflows"."runs" ("id") on delete cascade,
  "visit" text not null,
  "run_id" uuid not null references "workflows"."runs" ("id") on delete cascade,
  primary key ("parent", "visit")
);
create index if not exists "block_waiters_run" on "workflows"."block_waiters" ("run_id");

alter table "workflows"."runs" add column if not exists "rerun_from" text;

alter table "workflows"."workflows" alter column "definition" set default '{"trigger":{"manual":{}},"stateMachine":{"QueryLanguage":"JSONata","StartAt":"","States":{}}}'::jsonb;

create or replace function "workflows"."workflow_version"() returns trigger
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
  if to_jsonb(new) - array['run_status', 'status_run_id', 'status_run_at', 'unresolved_failures', 'resolved_at', 'resolved_by', 'updated_at'] is distinct from to_jsonb(old) - array['run_status', 'status_run_id', 'status_run_at', 'unresolved_failures', 'resolved_at', 'resolved_by', 'updated_at'] then
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end
$$;
drop trigger if exists "workflow_version" on "workflows"."workflows";
create trigger "workflow_version" before insert or update on "workflows"."workflows" for each row execute function "workflows"."workflow_version"();

create or replace function "workflows"."run_version"() returns trigger
language plpgsql as $$
declare
  found record;
begin
  select w.id, w.version, w.enabled_version, w.tenant_id into found from "workflows"."workflows" w where w.id = new.workflow_id;
  -- Another tenant's workflow is refused as one that is not there, so a start tells nothing of other tenants.
  if found.id is null or new.tenant_id is distinct from found.tenant_id then
    raise exception 'There is no workflow % here', new.workflow_id using errcode = '23503';
  end if;
  if found.version is null then
    raise exception 'Workflow % has no saved version', new.workflow_id using errcode = '23503';
  end if;
  if new.version is not null and not exists (select from "workflows"."versions" v where v.workflow_id = new.workflow_id and v.version = new.version) then
    raise exception 'Workflow % has no version %', new.workflow_id, new.version using errcode = '23503';
  end if;
  -- A replay replays a run of this workflow and tenant.
  if new.replay then
    if not exists (select from "workflows"."runs" r
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
  if exists (select from "workflows"."versions" v where v.workflow_id = new.workflow_id and v.version = new.version and v.definition -> 'stateMachine' -> 'States' = '{}'::jsonb) then
    raise exception 'Workflow % has no steps to run', new.workflow_id using errcode = '23503';
  end if;
  -- A re-run or a replay of a block's run runs that Block's processor again, alone.
  if new.rerun_of is not null then
    select r.input, r.block_state into new.input, new.block_state from "workflows"."runs" r where r.id = new.rerun_of and r.workflow_id = new.workflow_id;
  end if;
  return new;
end
$$;
comment on function "workflows"."run_version"() is 'Protobase workflows 22';
drop trigger if exists "run_version" on "workflows"."runs";
create trigger "run_version" before insert on "workflows"."runs" for each row execute function "workflows"."run_version"();

alter table "workflows"."workflows" add column if not exists "run_status" text not null default 'no_runs';
alter table "workflows"."workflows" add column if not exists "status_run_id" uuid;
alter table "workflows"."workflows" add column if not exists "status_run_at" timestamptz;
alter table "workflows"."workflows" add column if not exists "unresolved_failures" integer not null default 0;
alter table "workflows"."workflows" add column if not exists "resolved_at" timestamptz;
alter table "workflows"."workflows" add column if not exists "resolved_by" text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workflows_run_status' and connamespace = 'workflows'::regnamespace) then
    alter table "workflows"."workflows" add constraint "workflows_run_status" check ("run_status" in ('failing', 'unresolved', 'healthy', 'no_runs', 'resolved', 'new_version'));
  end if;
end $$;
create table if not exists "workflows"."resolutions" (
  "id" uuid primary key default gen_random_uuid(),
  "workflow_id" uuid not null references "workflows"."workflows" ("id") on delete cascade,
  "resolved_by" text,
  "tenant_id" text,
  "resolved_at" timestamptz not null default now()
);
create index if not exists "resolutions_workflow" on "workflows"."resolutions" ("workflow_id", "resolved_at");
create index if not exists "resolutions_tenant" on "workflows"."resolutions" ("tenant_id");
create index if not exists "resolutions_resolved_at" on "workflows"."resolutions" ("resolved_at");
create index if not exists "runs_ended" on "workflows"."runs" ("workflow_id", "finished_at" desc, "id" desc) where "status" in ('succeeded', 'failed');
-- The runs a workflow's status counts, so its status skips no blocks' runs, of which a run starts many, to find them.
create index if not exists "runs_ended_top" on "workflows"."runs" ("workflow_id", "finished_at" desc, "id" desc) where "status" in ('succeeded', 'failed') and "block_of" is null;

-- The status of a workflow at its version and last mark as resolved, from its last 10 ended runs, blocks' runs left out
-- (a block's failure is its run's): the run its
-- reason names is the latest for failing and healthy, the latest failure that counts for unresolved, none for the gray ones.
create or replace function "workflows"."workflow_status"(workflow uuid, current_version integer, resolved timestamptz)
returns table ("run_status" text, "status_run_id" uuid, "status_run_at" timestamptz, "unresolved_failures" integer)
language sql stable as $$
  with ended as (
    select r.id, r.finished_at, r.version, r.status = 'failed' as failed,
      r.status = 'failed' and r.version = current_version and (resolved is null or r.finished_at > resolved) as counts,
      row_number() over (order by r.finished_at desc, r.id desc) as n
    from (select * from "workflows"."runs" where workflow_id = workflow and block_of is null and status in ('succeeded', 'failed') order by finished_at desc, id desc limit 10) r
  ),
  latest as (select * from ended where n = 1),
  failure as (select * from ended where counts order by n limit 1),
  shown as (
    select case
        when l.id is null then 'no_runs'
        when l.counts then 'failing'
        when l.failed and l.version is distinct from current_version then 'new_version'
        when l.failed then 'resolved'
        when f.id is not null then 'unresolved'
        else 'healthy'
      end as status, l.id as latest_id, l.finished_at as latest_at, f.id as failure_id, f.finished_at as failure_at
    from (select) one left join latest l on true left join failure f on true
  )
  select status,
    case status when 'unresolved' then failure_id when 'failing' then latest_id when 'healthy' then latest_id end,
    case status when 'unresolved' then failure_at when 'failing' then latest_at when 'healthy' then latest_at end,
    (select count(*)::integer from ended where counts)
  from shown
$$;

-- A new version or a mark as resolved counts the failures again. Named to run after "workflow_version", which numbers the version.
create or replace function "workflows"."workflow_version_status"() returns trigger
language plpgsql as $$
begin
  if new.version is distinct from old.version or new.resolved_at is distinct from old.resolved_at then
    select st.run_status, st.status_run_id, st.status_run_at, st.unresolved_failures
      into new.run_status, new.status_run_id, new.status_run_at, new.unresolved_failures
      from "workflows"."workflow_status"(new.id, new.version, new.resolved_at) st;
  end if;
  return new;
end
$$;
drop trigger if exists "workflow_version_status" on "workflows"."workflows";
create trigger "workflow_version_status" before update on "workflows"."workflows" for each row execute function "workflows"."workflow_version_status"();

-- A run that ends computes its workflow's status again. The workflow is locked first, in a statement of its own, so a
-- run of it ending at the same time has committed before the update's snapshot is taken, and the status counts both.
create or replace function "workflows"."run_status"() returns trigger
language plpgsql as $$
begin
  perform 1 from "workflows"."workflows" where id = new.workflow_id for no key update;
  update "workflows"."workflows" w set ("run_status", "status_run_id", "status_run_at", "unresolved_failures") =
    (select st.run_status, st.status_run_id, st.status_run_at, st.unresolved_failures from "workflows"."workflow_status"(w.id, w.version, w.resolved_at) st)
    where w.id = new.workflow_id;
  return null;
end
$$;
drop trigger if exists "run_status" on "workflows"."runs";
create trigger "run_status" after update of "status" on "workflows"."runs" for each row
  when (new.status in ('succeeded', 'failed') and old.status is distinct from new.status and new.block_of is null) execute function "workflows"."run_status"();

-- Marking a workflow resolved: refused for another tenant's workflow as one that is not there, then copied onto it.
create or replace function "workflows"."resolution"() returns trigger
language plpgsql as $$
begin
  if not exists (select from "workflows"."workflows" w where w.id = new.workflow_id and w.tenant_id is not distinct from new.tenant_id) then
    raise exception 'There is no workflow % here', new.workflow_id using errcode = '23503';
  end if;
  update "workflows"."workflows" set "resolved_at" = new.resolved_at, "resolved_by" = new.resolved_by where id = new.workflow_id;
  return null;
end
$$;
drop trigger if exists "resolution" on "workflows"."resolutions";
create trigger "resolution" after insert on "workflows"."resolutions" for each row execute function "workflows"."resolution"();

update "workflows"."workflows" w set ("run_status", "status_run_id", "status_run_at", "unresolved_failures") =
  (select st.run_status, st.status_run_id, st.status_run_at, st.unresolved_failures from "workflows"."workflow_status"(w.id, w.version, w.resolved_at) st);
