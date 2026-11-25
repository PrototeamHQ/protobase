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

/** The tables `customStepsSql` makes, which `protobase migration baseline` finds with custom steps on. */
export const customStepsTables = ['custom_steps', 'custom_step_versions']

/**
 * The custom steps of each tenant, by a name unique in it, and each version of their manifests as it was saved. A step
 * numbers its next version as a write changes its manifest, in the row the write returns; the save hook keeps that
 * version, saved by the caller. A version outlives its step, so `custom:<name>:<version>` names one manifest only, ever:
 * a step made again under a deleted one's name goes on from its last version. Each write gives the row a new
 * `updated_at`, its ETag. Every statement is idempotent.
 */
export const customStepsTablesSql = (schema: string) => {
  const s = quoteIdent(schema)
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
  "id" uuid primary key default gen_random_uuid(),
  -- None once its step is deleted: the version stays, as what its name and number meant
  "custom_step_id" uuid references ${s}."custom_steps" ("id") on delete set null,
  "version" integer not null,
  "tenant_id" text,
  "name" text not null,
  ${manifestColumns},
  "saved_by" text,
  "saved_at" timestamptz not null default now()
);
create unique index if not exists "custom_step_versions_name" on ${s}."custom_step_versions" (coalesce("tenant_id", ''), "name", "version");
create index if not exists "custom_step_versions_step" on ${s}."custom_step_versions" ("custom_step_id", "version");
create index if not exists "custom_step_versions_version" on ${s}."custom_step_versions" ("version")`
}

/** The trigger that numbers a custom step's next version as a write changes its manifest (`customStepsTablesSql`). */
export const customStepsFunctionsSql = (schema: string) => {
  const s = quoteIdent(schema)
  const changed = (row: string) => `(${manifest.map((column) => `${row}.${column}`).join(', ')})`
  return `create or replace function ${s}."custom_step_version"() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- After every version a step of this name had, a deleted one's included
    new.version := coalesce((select max(v.version) from ${s}."custom_step_versions" v
      where coalesce(v.tenant_id, '') = coalesce(new.tenant_id, '') and v.name = new.name), 0) + 1;
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
