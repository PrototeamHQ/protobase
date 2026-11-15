import { quoteIdent } from '../../changes/capture-sql'

// A custom step's manifest, each part a column of its own, on a custom step and on each of its versions.
const manifestColumns = `"label" text not null,
  "description" text,
  "kind" text not null default 'container' check ("kind" in ('container')),
  "container" jsonb not null,
  "input" jsonb not null,
  "output" jsonb not null,
  "error_prefix" text not null default 'Custom',
  "errors" jsonb not null default '{}'::jsonb`

const manifest = ['label', 'description', 'kind', 'container', 'input', 'output', 'error_prefix', 'errors']

/** The tables `customStepsSql` makes, which the startup check finds with custom steps on. */
export const customStepsTables = ['custom_steps', 'custom_step_versions']

/**
 * The custom steps of each tenant, by a name unique in it, and each version of their manifests as it was saved, which
 * goes with its step. A step numbers its next version as a write changes its manifest, in the row the write returns;
 * the save hook keeps that version, saved by the caller. Each write gives the row a new `updated_at`, its ETag. Every
 * statement is idempotent.
 */
export const customStepsSql = (schema: string) => {
  const s = quoteIdent(schema)
  const changed = (row: string) => `(${manifest.map((column) => `${row}.${column}`).join(', ')})`
  return `create table if not exists ${s}."custom_steps" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "version" integer not null default 1,
  ${manifestColumns},
  "tenant_id" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create unique index if not exists "custom_steps_name" on ${s}."custom_steps" (coalesce("tenant_id", ''), "name");
create index if not exists "custom_steps_tenant" on ${s}."custom_steps" ("tenant_id");
create index if not exists "custom_steps_name_order" on ${s}."custom_steps" ("name");
create index if not exists "custom_steps_name_search" on ${s}."custom_steps" using gin ("name" gin_trgm_ops);
create index if not exists "custom_steps_updated_at" on ${s}."custom_steps" ("updated_at");

create table if not exists ${s}."custom_step_versions" (
  "custom_step_id" uuid not null references ${s}."custom_steps" ("id") on delete cascade,
  "version" integer not null,
  "tenant_id" text,
  "name" text not null,
  ${manifestColumns},
  "saved_by" text,
  "saved_at" timestamptz not null default now(),
  primary key ("custom_step_id", "version")
);
create index if not exists "custom_step_versions_tenant" on ${s}."custom_step_versions" ("tenant_id", "name", "version");
create index if not exists "custom_step_versions_version" on ${s}."custom_step_versions" ("version");

create or replace function ${s}."custom_step_version"() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    return new;
  end if;
  -- The write holds the row, so a save in another transaction numbers its version after this one.
  new.version := case when ${changed('new')} is distinct from ${changed('old')} then old.version + 1 else old.version end;
  -- Never the same twice, nor now(): two writes in one transaction are two ETags.
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end
$$;
drop trigger if exists "custom_step_version" on ${s}."custom_steps";
create trigger "custom_step_version" before insert or update on ${s}."custom_steps" for each row execute function ${s}."custom_step_version"()`
}
