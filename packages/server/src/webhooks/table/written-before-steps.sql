create schema if not exists "webhooks";

create table if not exists "webhooks"."subscriptions" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "events" text not null,
  "url" text not null,
  "filter" text,
  "headers" jsonb,
  "payload" text not null default 'full' check ("payload" in ('full', 'thin')),
  "enabled" boolean not null default true,
  "secret" text not null default ('whsec_' || encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64')),
  "previous_secret" text,
  "previous_secret_until" timestamptz,
  "tenant_id" text,
  "owner_id" text default (nullif(current_setting('changes.actor', true), '')::jsonb ->> 'id'),
  "disabled_reason" text,
  "last_success_at" timestamptz,
  "failing_since" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "rotate_secret" boolean not null default false,
  "send_test" boolean not null default false,
  "resend_failed" boolean not null default false
);

create extension if not exists pg_trgm;
create index if not exists "subscriptions_tenant" on "webhooks"."subscriptions" ("tenant_id");
create index if not exists "subscriptions_owner" on "webhooks"."subscriptions" ("owner_id");
create index if not exists "subscriptions_created_at" on "webhooks"."subscriptions" ("created_at");
create index if not exists "subscriptions_name" on "webhooks"."subscriptions" ("name");
create index if not exists "subscriptions_enabled" on "webhooks"."subscriptions" ("enabled");
create index if not exists "subscriptions_last_success_at" on "webhooks"."subscriptions" ("last_success_at");
create index if not exists "subscriptions_name_search" on "webhooks"."subscriptions" using gin ("name" gin_trgm_ops);
create index if not exists "subscriptions_url_search" on "webhooks"."subscriptions" using gin ("url" gin_trgm_ops);

create or replace function "webhooks"."subscription_commands"() returns trigger
language plpgsql as $$
begin
  if new.rotate_secret then
    new.previous_secret := old.secret;
    new.previous_secret_until := now() + interval '24 hours';
    new.secret := 'whsec_' || encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64');
    new.rotate_secret := false;
  end if;
  if new.send_test then
    perform jobs.enqueue('webhooks.send-test', jsonb_build_object('subscription', new.id));
    new.send_test := false;
  end if;
  if new.resend_failed then
    update jobs.job
    set state = 'retry', retry_limit = retry_limit + 1, completed_on = null,
      start_after = greatest(start_after, jobs.job_now()), keep_until = greatest(keep_until, jobs.job_now() + interval '14 days')
    where name = any(array['webhooks.deliver', 'webhooks.deliver-ordered']) and state = 'failed' and data ->> 'subscription' = 'ui:' || new.id::text;
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
comment on function "webhooks"."subscription_commands"() is 'Protobase webhooks 2';
drop trigger if exists "subscription_commands" on "webhooks"."subscriptions";
create trigger "subscription_commands" before update on "webhooks"."subscriptions" for each row execute function "webhooks"."subscription_commands"();

drop view if exists "webhooks"."deliveries";
create view "webhooks"."deliveries" as
select j.id, s.id as subscription_id, s.tenant_id,
  coalesce(j.data -> 'event' ->> 'type', j.data -> 'events' -> 0 ->> 'type') as event_type,
  coalesce(j.data -> 'event' ->> 'id', j.data -> 'events' -> 0 ->> 'id') as event_id,
  case when j.state = 'failed' then 'failed' else 'waiting' end as status,
  coalesce((j.data ->> 'attempt')::integer, j.retry_count + 1) as attempt,
  case when j.state = 'failed' then null else j.start_after end as next_attempt,
  coalesce(j.output ->> 'message', j.data ->> 'lastError') as last_error,
  j.created_on as created_at,
  false as resend
from jobs.job j join "webhooks"."subscriptions" s on j.data ->> 'subscription' = 'ui:' || s.id::text
where j.name = any(array['webhooks.deliver', 'webhooks.deliver-ordered']) and j.state in ('created', 'retry', 'failed');
create or replace function "webhooks"."deliveries_resend"() returns trigger
language plpgsql as $$
begin
  if new.resend then
    update jobs.job
    set state = 'retry', retry_limit = retry_limit + 1, completed_on = null,
      start_after = greatest(start_after, jobs.job_now()), keep_until = greatest(keep_until, jobs.job_now() + interval '14 days')
    where name = any(array['webhooks.deliver', 'webhooks.deliver-ordered']) and state = 'failed' and id = old.id;
  end if;
  return new;
end
$$;
comment on function "webhooks"."deliveries_resend"() is 'Protobase webhooks 2';
create trigger "deliveries_resend" instead of update on "webhooks"."deliveries" for each row execute function "webhooks"."deliveries_resend"();

create table if not exists "webhooks"."delivery_log" (
  "id" bigint generated always as identity primary key,
  "subscription_id" uuid not null references "webhooks"."subscriptions" ("id") on delete cascade,
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

create index if not exists "delivery_log_subscription" on "webhooks"."delivery_log" ("subscription_id", "at");
create index if not exists "delivery_log_at" on "webhooks"."delivery_log" ("at");
create index if not exists "delivery_log_event_id" on "webhooks"."delivery_log" ("event_id");
create index if not exists "delivery_log_event_type" on "webhooks"."delivery_log" ("event_type");
create index if not exists "delivery_log_status" on "webhooks"."delivery_log" ("status");
create index if not exists "delivery_log_status_code" on "webhooks"."delivery_log" ("status_code");
