create extension if not exists pg_trgm;

create schema if not exists table_definitions;

revoke create on schema table_definitions from public;

create schema if not exists user_tables;

revoke create on schema user_tables from public;

grant usage, create on schema user_tables to current_user;

create table table_definitions.tables (
  id bigint generated always as identity primary key,
  name text not null check (name ~ '^[a-z][a-z0-9_]*$' and octet_length(name) <= 63),
  organization_id text,
  singular_label text not null,
  plural_label text not null,
  title_field text check (title_field ~ '^[a-z][a-z0-9_]*$' and octet_length(title_field) <= 63),
  version bigint not null default 1 check (version > 0),
  table_name text not null unique generated always as (case when organization_id is null then name else 't' || id || '_' || name end) stored check (table_name ~ '^[a-z][a-z0-9_]*$' and octet_length(table_name) <= 63),
  tenant_key text not null generated always as (coalesce(organization_id, '-')) stored,
  unique (id, tenant_key)
);

create unique index tables_name_key on table_definitions.tables (name) where organization_id is null;

create unique index tables_organization_name_key on table_definitions.tables (organization_id, name) where organization_id is not null;

create table table_definitions.fields (
  table_id bigint not null,
  organization_id text,
  tenant_key text not null generated always as (coalesce(organization_id, '-')) stored,
  name text not null check (name ~ '^[a-z][a-z0-9_]*$' and octet_length(name) <= 63) check (name not in ('id', 'etag')),
  label text not null,
  type text not null check (type in ('text', 'long_text', 'integer', 'decimal', 'boolean', 'date', 'timestamp', 'json')),
  required boolean not null,
  position integer not null,
  precision integer check (precision between 1 and 1000),
  scale integer check (scale between 0 and precision),
  primary key (table_id, name),
  foreign key (table_id, tenant_key) references table_definitions.tables (id, tenant_key) on delete cascade,
  check ((type = 'decimal') = (precision is not null and scale is not null))
);

create index if not exists fields_position_idx on table_definitions.fields (table_id, position);
