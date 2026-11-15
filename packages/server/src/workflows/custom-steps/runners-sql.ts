import { quoteIdent } from '../../changes/capture-sql'

/** The tables `runnersSql` makes, which the startup check finds with custom steps on. */
export const runnersTables = ['runners', 'custom_step_jobs', 'custom_step_builds', 'custom_step_wanted']

/**
 * The runners of each tenant, the jobs of its custom steps they claim, the images they build, and the custom step
 * versions its published workflows use.
 *
 * A runner keeps only the SHA-256 of its one-time registration token and of its own token. Its admin fields (name,
 * labels, revoked) give the row a new `updated_at`, its ETag, which what it says with each claim leaves as it is; its
 * free slots and the images it holds are columns the database keeps from what it said last.
 * Revoking it is kept with its time; revoking or deleting it puts the jobs it holds back in the queue.
 *
 * A job is one try of a custom step, unique by its run and try (`visit`). It holds the arguments as given sealed with
 * the app's secret, which only the claim answer opens, for the runner it places the job with, and which go once the
 * job ends; `input` is what the step records, its secrets blanked out. Of the try's task token it keeps only the
 * hash, by which the app answers the try for the runner. As the try is answered or ends, the job ends with it:
 * succeeded, failed, or timed out when its time or heartbeat ran out; as its run ends, the jobs it left are timed out.
 *
 * A build is one runner's build of a version's image, as the runner reports it: building, then ready with the image's
 * digest, or failed, with its log's tail. A runner sent `prepare` for a version has a build of it from then on, which
 * its report of the start takes up.
 *
 * The wanted custom step versions are the ones each workflow's published version uses, written as it is published and
 * dropped as it is turned off, which runners that build are sent `prepare` for.
 *
 * Every statement is idempotent.
 */
export const runnersSql = (schema: string) => {
  const s = quoteIdent(schema)
  // What a job keeps once it ends: no arguments or lease.
  const ended = `"finished_at" = now(), "arguments" = null, "lease_until" = null`
  return `create table if not exists ${s}."runners" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "labels" jsonb not null default '[]'::jsonb,
  "revoked" boolean not null default false,
  "revoked_at" timestamptz,
  "registration_hash" text unique,
  "registration_expires_at" timestamptz,
  "registered_at" timestamptz,
  "token_hash" text unique,
  "platform" text,
  "kinds" jsonb not null default '[]'::jsonb,
  "state" jsonb,
  "polled_at" timestamptz,
  "polling_until" timestamptz,
  "tenant_id" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index if not exists "runners_tenant" on ${s}."runners" ("tenant_id");
create index if not exists "runners_name" on ${s}."runners" ("name");
create index if not exists "runners_name_search" on ${s}."runners" using gin ("name" gin_trgm_ops);
create index if not exists "runners_updated_at" on ${s}."runners" ("updated_at");
create index if not exists "runners_polling" on ${s}."runners" ("polling_until") where "polling_until" is not null;
-- What its last claim said, as columns a list shows: its free slots, and the custom step versions whose images it holds
alter table ${s}."runners" add column if not exists "free_slots" integer generated always as (("state" -> 'capacity' ->> 'slots')::integer) stored;
alter table ${s}."runners" add column if not exists "images" jsonb generated always as (coalesce(jsonb_path_query_array("state", '$.images[*].step'), '[]'::jsonb)) stored;

create table if not exists ${s}."custom_step_jobs" (
  "id" uuid primary key default gen_random_uuid(),
  "run_id" uuid not null references ${s}."runs" ("id") on delete cascade,
  "visit" text not null,
  "state" text not null,
  "step" text not null,
  "version_id" uuid not null references ${s}."custom_step_versions" ("id") on delete cascade,
  "input" jsonb,
  -- Sealed with the app's secret; only the claim answer opens them, for the runner holding the job, and they go once it ends
  "arguments" text,
  "token_hash" text not null,
  "status" text not null default 'queued' check ("status" in ('queued', 'running', 'succeeded', 'failed', 'timed_out')),
  "runner_id" uuid references ${s}."runners" ("id") on delete set null,
  "requeues" integer not null default 0,
  "lease_until" timestamptz,
  "queued_at" timestamptz not null default now(),
  "passed_over_at" timestamptz,
  "claimed_at" timestamptz,
  "sent_at" timestamptz,
  "finished_at" timestamptz,
  "output" jsonb,
  "error" text,
  "cause" text,
  "logs" jsonb not null default '[]'::jsonb,
  "tenant_id" text,
  unique ("run_id", "visit")
);
create index if not exists "custom_step_jobs_tenant" on ${s}."custom_step_jobs" ("tenant_id");
create index if not exists "custom_step_jobs_queued_at" on ${s}."custom_step_jobs" ("queued_at");
create index if not exists "custom_step_jobs_status" on ${s}."custom_step_jobs" ("status", "queued_at");
create index if not exists "custom_step_jobs_runner" on ${s}."custom_step_jobs" ("runner_id", "queued_at");
create index if not exists "custom_step_jobs_token" on ${s}."custom_step_jobs" ("token_hash");
create index if not exists "custom_step_jobs_version" on ${s}."custom_step_jobs" ("version_id", "queued_at");

create table if not exists ${s}."custom_step_builds" (
  "id" uuid primary key default gen_random_uuid(),
  "runner_id" uuid references ${s}."runners" ("id") on delete set null,
  "version_id" uuid not null references ${s}."custom_step_versions" ("id") on delete cascade,
  "step" text not null,
  "status" text not null default 'building' check ("status" in ('building', 'ready', 'failed')),
  "digest" text,
  "log" text,
  "started_at" timestamptz not null default now(),
  "finished_at" timestamptz,
  "tenant_id" text
);
create index if not exists "custom_step_builds_tenant" on ${s}."custom_step_builds" ("tenant_id");
create index if not exists "custom_step_builds_version" on ${s}."custom_step_builds" ("version_id", "started_at");
create index if not exists "custom_step_builds_runner" on ${s}."custom_step_builds" ("runner_id", "version_id");
create index if not exists "custom_step_builds_started_at" on ${s}."custom_step_builds" ("started_at");
create index if not exists "custom_step_builds_status" on ${s}."custom_step_builds" ("status", "started_at");

create table if not exists ${s}."custom_step_wanted" (
  "workflow_id" uuid not null references ${s}."workflows" ("id") on delete cascade,
  "version_id" uuid not null references ${s}."custom_step_versions" ("id") on delete cascade,
  "tenant_id" text,
  primary key ("workflow_id", "version_id")
);
create index if not exists "custom_step_wanted_version" on ${s}."custom_step_wanted" ("version_id");
create index if not exists "custom_step_wanted_tenant" on ${s}."custom_step_wanted" ("tenant_id");

create or replace function ${s}."runner_written"() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' or (new.revoked and not old.revoked) then
    update ${s}."custom_step_jobs" set "status" = 'queued', "runner_id" = null, "lease_until" = null, "claimed_at" = null, "sent_at" = null, "passed_over_at" = null, "queued_at" = now()
      where "runner_id" = old.id and "status" = 'running';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.revoked and not old.revoked then
    new.revoked_at := now();
    new.polling_until := null;
  end if;
  if (new.name, new.labels, new.revoked) is distinct from (old.name, old.labels, old.revoked) then
    -- Never the same twice, nor now(): two writes in one transaction are two ETags.
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end
$$;
drop trigger if exists "runner_written" on ${s}."runners";
create trigger "runner_written" before update or delete on ${s}."runners" for each row execute function ${s}."runner_written"();

create or replace function ${s}."custom_step_job_answered"() returns trigger
language plpgsql as $$
begin
  update ${s}."custom_step_jobs" set ${ended},
    "status" = case when new.status = 'succeeded' then 'succeeded' when new.error in ('States.Timeout', 'States.HeartbeatTimeout') then 'timed_out' else 'failed' end,
    "output" = new.output, "error" = new.error, "cause" = new.cause
    where "token_hash" = new.token_hash and "status" in ('queued', 'running');
  return null;
end
$$;
drop trigger if exists "custom_step_job_answered" on ${s}."task_tokens";
create trigger "custom_step_job_answered" after update of "status" on ${s}."task_tokens" for each row
  when (old.status = 'waiting' and new.status <> 'waiting') execute function ${s}."custom_step_job_answered"();

create or replace function ${s}."custom_step_run_ended"() returns trigger
language plpgsql as $$
begin
  update ${s}."custom_step_jobs" set ${ended}, "status" = 'timed_out', "cause" = 'Its run ended'
    where "run_id" = new.id and "status" in ('queued', 'running');
  return null;
end
$$;
drop trigger if exists "custom_step_run_ended" on ${s}."runs";
create trigger "custom_step_run_ended" after update of "status" on ${s}."runs" for each row
  when (new.status in ('succeeded', 'failed') and old.status is distinct from new.status) execute function ${s}."custom_step_run_ended"()`
}
