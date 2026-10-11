import { quoteIdent } from '../../changes/capture-sql'
import { jobsSchema } from '../../jobs/schema'

/** Bumped whenever the functions or views below change, so the next migration writes them again. */
export const webhooksVersion = 1

/** The comment the schema's functions carry, which the startup check reads. */
export const webhooksComment = `Protobase webhooks ${webhooksVersion}`

/** The delivery jobs, whose waiting and failed ones the deliveries view lists. */
export const deliveryJobs = ['webhooks.deliver', 'webhooks.deliver-ordered']

/** The job that sends a subscription a test event. */
export const sendTestJob = 'webhooks.send-test'

// 32 random bytes as Standard Webhooks writes a secret, from what core Postgres has: two random UUIDs, 244 random bits.
const randomSecret = `'whsec_' || encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64')`

/**
 * The subscriptions table. The owner is the API's caller, from the change capture's `actor` setting; the tenant is set by
 * the API like any tenant column. `rotate_secret`, `send_test` and `resend_failed` are commands: an update that sets one
 * runs it and stores false.
 */
export const subscriptionsSql = (schema: string, changesSchema: string) => `create table if not exists ${quoteIdent(schema)}."subscriptions" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "events" text not null,
  "url" text not null,
  "filter" text,
  "headers" jsonb,
  "payload" text not null default 'full' check ("payload" in ('full', 'thin')),
  "enabled" boolean not null default true,
  "secret" text not null default (${randomSecret}),
  "previous_secret" text,
  "previous_secret_until" timestamptz,
  "tenant_id" text,
  "owner_id" text default (nullif(current_setting('${changesSchema}.actor', true), '')::jsonb ->> 'id'),
  "disabled_reason" text,
  "last_success_at" timestamptz,
  "failing_since" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "rotate_secret" boolean not null default false,
  "send_test" boolean not null default false,
  "resend_failed" boolean not null default false
);
create index if not exists "subscriptions_tenant" on ${quoteIdent(schema)}."subscriptions" ("tenant_id")`

// A failed job runs once more, from now, as the failed jobs page retries it.
const retryJobs = (where: string) => `update ${jobsSchema}.job
    set state = 'retry', retry_limit = retry_limit + 1, completed_on = null,
      start_after = greatest(start_after, ${jobsSchema}.job_now()), keep_until = greatest(keep_until, ${jobsSchema}.job_now() + interval '14 days')
    where name = any(array['${deliveryJobs.join("', '")}']) and state = 'failed' and ${where}`

/** The commands of the subscriptions table, and a re-enabled subscription starting afresh. */
export const commandsSql = (schema: string) => `create or replace function ${quoteIdent(schema)}."subscription_commands"() returns trigger
language plpgsql as $$
begin
  if new.rotate_secret then
    new.previous_secret := old.secret;
    new.previous_secret_until := now() + interval '24 hours';
    new.secret := ${randomSecret};
    new.rotate_secret := false;
  end if;
  if new.send_test then
    perform ${jobsSchema}.enqueue('${sendTestJob}', jsonb_build_object('subscription', new.id));
    new.send_test := false;
  end if;
  if new.resend_failed then
    ${retryJobs(`data ->> 'subscription' = 'ui:' || new.id::text`)};
    new.resend_failed := false;
  end if;
  if new.enabled and not old.enabled then
    new.disabled_reason := null;
    new.failing_since := null;
  end if;
  new.updated_at := now();
  return new;
end
$$;
comment on function ${quoteIdent(schema)}."subscription_commands"() is '${webhooksComment}';
drop trigger if exists "subscription_commands" on ${quoteIdent(schema)}."subscriptions";
create trigger "subscription_commands" before update on ${quoteIdent(schema)}."subscriptions" for each row execute function ${quoteIdent(schema)}."subscription_commands"()`

/**
 * The deliveries of table subscriptions that wait for a retry or failed for good: the delivery jobs, with their
 * subscription's tenant. Updating `resend` to true runs a failed one once more.
 */
export const deliveriesSql = (schema: string) => `drop view if exists ${quoteIdent(schema)}."deliveries";
create view ${quoteIdent(schema)}."deliveries" as
select j.id, s.id as subscription_id, s.tenant_id,
  coalesce(j.data -> 'event' ->> 'type', j.data -> 'events' -> 0 ->> 'type') as event_type,
  coalesce(j.data -> 'event' ->> 'id', j.data -> 'events' -> 0 ->> 'id') as event_id,
  case when j.state = 'failed' then 'failed' else 'waiting' end as status,
  coalesce((j.data ->> 'attempt')::integer, j.retry_count + 1) as attempt,
  case when j.state = 'failed' then null else j.start_after end as next_attempt,
  coalesce(j.output ->> 'message', j.data ->> 'lastError') as last_error,
  j.created_on as created_at,
  false as resend
from ${jobsSchema}.job j join ${quoteIdent(schema)}."subscriptions" s on j.data ->> 'subscription' = 'ui:' || s.id::text
where j.name = any(array['${deliveryJobs.join("', '")}']) and j.state in ('created', 'retry', 'failed');
create or replace function ${quoteIdent(schema)}."deliveries_resend"() returns trigger
language plpgsql as $$
begin
  if new.resend then
    ${retryJobs('id = old.id')};
  end if;
  return new;
end
$$;
comment on function ${quoteIdent(schema)}."deliveries_resend"() is '${webhooksComment}';
create trigger "deliveries_resend" instead of update on ${quoteIdent(schema)}."deliveries" for each row execute function ${quoteIdent(schema)}."deliveries_resend"()`

/** Every try of a table subscription's deliveries, kept 30 days, with `deliveryLog`. */
export const deliveryLogSql = (schema: string) => `create table if not exists ${quoteIdent(schema)}."delivery_log" (
  "id" bigint generated always as identity primary key,
  "subscription_id" uuid not null references ${quoteIdent(schema)}."subscriptions" ("id") on delete cascade,
  "tenant_id" text,
  "event_id" text not null,
  "event_type" text not null,
  "status" text not null check ("status" in ('delivered', 'failed')),
  "attempt" integer not null,
  "status_code" integer,
  "response" text,
  "duration_ms" integer not null,
  "at" timestamptz not null default now()
);
create index if not exists "delivery_log_subscription" on ${quoteIdent(schema)}."delivery_log" ("subscription_id", "at")`
