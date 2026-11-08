import { quoteIdent } from '../../changes/capture-sql'

/**
 * The storage configurations workflows store files in, by name, unique per tenant: a folder under the storage root
 * or a bucket, with the bucket's keys encrypted. Each write gives the row a new `updated_at`, its ETag.
 */
export const storageSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `create table if not exists ${s}."storage_configurations" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "kind" text not null check ("kind" in ('local', 's3')),
  "dir" text,
  "bucket" text,
  "region" text,
  "endpoint" text,
  "access_key_id" text,
  "secret_access_key" text,
  "tenant_id" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create unique index if not exists "storage_configurations_name" on ${s}."storage_configurations" (coalesce("tenant_id", ''), "name");
create index if not exists "storage_configurations_tenant" on ${s}."storage_configurations" ("tenant_id");
create index if not exists "storage_configurations_name_order" on ${s}."storage_configurations" ("name");
create index if not exists "storage_configurations_name_search" on ${s}."storage_configurations" using gin ("name" gin_trgm_ops);
create index if not exists "storage_configurations_updated_at" on ${s}."storage_configurations" ("updated_at");

create or replace function ${s}."storage_configuration_updated"() returns trigger
language plpgsql as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end
$$;
drop trigger if exists "storage_configuration_updated" on ${s}."storage_configurations";
create trigger "storage_configuration_updated" before update on ${s}."storage_configurations" for each row execute function ${s}."storage_configuration_updated"()`
}
