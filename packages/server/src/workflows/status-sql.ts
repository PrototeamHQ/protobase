import { statusRuns, workflowStatuses } from '@protobase/schema/internal'
import { quoteIdent } from '../changes/capture-sql'

/** The triggers `statusSql` makes, which the startup check finds on their tables. */
export const statusTriggers = ['workflow_version_status', 'run_status', 'resolution']

const statusList = workflowStatuses.map((status) => `'${status}'`).join(', ')

/**
 * A workflow's status from its last ended runs, kept on its row by the database: each run that ends, each mark as
 * resolved and each new version computes it again. A failure counts while it ended after the workflow was last marked
 * resolved and ran on the workflow's current version. Marking resolved is a row of `resolutions`, kept with who did it,
 * which copies itself onto the workflow. Written whole each time: every statement is idempotent.
 */
export const statusSql = (schema: string) => {
  const s = quoteIdent(schema)
  const tenantSchema = `'${schema.replaceAll("'", "''")}'`
  return `alter table ${s}."workflows" add column if not exists "run_status" text not null default 'no_runs';
alter table ${s}."workflows" add column if not exists "status_run_id" uuid;
alter table ${s}."workflows" add column if not exists "status_run_at" timestamptz;
alter table ${s}."workflows" add column if not exists "unresolved_failures" integer not null default 0;
alter table ${s}."workflows" add column if not exists "resolved_at" timestamptz;
alter table ${s}."workflows" add column if not exists "resolved_by" text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workflows_run_status' and connamespace = ${tenantSchema}::regnamespace) then
    alter table ${s}."workflows" add constraint "workflows_run_status" check ("run_status" in (${statusList}));
  end if;
end $$;
create table if not exists ${s}."resolutions" (
  "id" uuid primary key default gen_random_uuid(),
  "workflow_id" uuid not null references ${s}."workflows" ("id") on delete cascade,
  "resolved_by" text,
  "tenant_id" text,
  "resolved_at" timestamptz not null default now()
);
create index if not exists "resolutions_workflow" on ${s}."resolutions" ("workflow_id", "resolved_at");
create index if not exists "resolutions_tenant" on ${s}."resolutions" ("tenant_id");
create index if not exists "resolutions_resolved_at" on ${s}."resolutions" ("resolved_at");
create index if not exists "runs_ended" on ${s}."runs" ("workflow_id", "finished_at" desc, "id" desc) where "status" in ('succeeded', 'failed');

-- The status of a workflow at its version and last mark as resolved, from its last ${statusRuns} ended runs, blocks' runs left out
-- (a block's failure is its run's): the run its
-- reason names is the latest for failing and healthy, the latest failure that counts for unresolved, none for the gray ones.
create or replace function ${s}."workflow_status"(workflow uuid, current_version integer, resolved timestamptz)
returns table ("run_status" text, "status_run_id" uuid, "status_run_at" timestamptz, "unresolved_failures" integer)
language sql stable as $$
  with ended as (
    select r.id, r.finished_at, r.version, r.status = 'failed' as failed,
      r.status = 'failed' and r.version = current_version and (resolved is null or r.finished_at > resolved) as counts,
      row_number() over (order by r.finished_at desc, r.id desc) as n
    from (select * from ${s}."runs" where workflow_id = workflow and block_of is null and status in ('succeeded', 'failed') order by finished_at desc, id desc limit ${statusRuns}) r
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
create or replace function ${s}."workflow_version_status"() returns trigger
language plpgsql as $$
begin
  if new.version is distinct from old.version or new.resolved_at is distinct from old.resolved_at then
    select st.run_status, st.status_run_id, st.status_run_at, st.unresolved_failures
      into new.run_status, new.status_run_id, new.status_run_at, new.unresolved_failures
      from ${s}."workflow_status"(new.id, new.version, new.resolved_at) st;
  end if;
  return new;
end
$$;
drop trigger if exists "workflow_version_status" on ${s}."workflows";
create trigger "workflow_version_status" before update on ${s}."workflows" for each row execute function ${s}."workflow_version_status"();

-- A run that ends computes its workflow's status again. The workflow is locked first, in a statement of its own, so a
-- run of it ending at the same time has committed before the update's snapshot is taken, and the status counts both.
create or replace function ${s}."run_status"() returns trigger
language plpgsql as $$
begin
  perform 1 from ${s}."workflows" where id = new.workflow_id for no key update;
  update ${s}."workflows" w set ("run_status", "status_run_id", "status_run_at", "unresolved_failures") =
    (select st.run_status, st.status_run_id, st.status_run_at, st.unresolved_failures from ${s}."workflow_status"(w.id, w.version, w.resolved_at) st)
    where w.id = new.workflow_id;
  return null;
end
$$;
drop trigger if exists "run_status" on ${s}."runs";
create trigger "run_status" after update of "status" on ${s}."runs" for each row
  when (new.status in ('succeeded', 'failed') and old.status is distinct from new.status and new.block_of is null) execute function ${s}."run_status"();

-- Marking a workflow resolved: refused for another tenant's workflow as one that is not there, then copied onto it.
create or replace function ${s}."resolution"() returns trigger
language plpgsql as $$
begin
  if not exists (select from ${s}."workflows" w where w.id = new.workflow_id and w.tenant_id is not distinct from new.tenant_id) then
    raise exception 'There is no workflow % here', new.workflow_id using errcode = '23503';
  end if;
  update ${s}."workflows" set "resolved_at" = new.resolved_at, "resolved_by" = new.resolved_by where id = new.workflow_id;
  return null;
end
$$;
drop trigger if exists "resolution" on ${s}."resolutions";
create trigger "resolution" after insert on ${s}."resolutions" for each row execute function ${s}."resolution"();

update ${s}."workflows" w set ("run_status", "status_run_id", "status_run_at", "unresolved_failures") =
  (select st.run_status, st.status_run_id, st.status_run_at, st.unresolved_failures from ${s}."workflow_status"(w.id, w.version, w.resolved_at) st)`
}
