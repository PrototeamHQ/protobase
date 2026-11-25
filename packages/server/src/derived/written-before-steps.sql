create schema if not exists "derived";

create sequence if not exists "derived"."versions";

create table if not exists "derived"."values" (
  "name" text not null,
  "key" text not null,
  "status" text not null check ("status" in ('current', 'stale', 'recalculating')),
  "version" bigint not null,
  "value" jsonb,
  "computed_at" timestamptz,
  "flips_at" timestamptz,
  primary key ("name", "key")
);

create table if not exists "derived"."reads" (
  "name" text not null,
  "key" text not null,
  "resource" text not null,
  "eq_field" text,
  "eq_value" text,
  "condition" jsonb not null,
  "fields" jsonb
);

create table if not exists "derived"."pending" (
  "name" text not null,
  "key" text not null,
  "change" jsonb not null
);

create table if not exists "derived"."declared" ("name" text primary key);

create index if not exists "reads_match" on "derived"."reads" ("resource", "eq_field", "eq_value");
create index if not exists "reads_value" on "derived"."reads" ("name", "key");
create index if not exists "pending_value" on "derived"."pending" ("name", "key");

insert into "derived"."declared" ("name") values ('notes.summary') on conflict do nothing;

select jobs.enqueue('derived.fill', '{"name":"notes.summary"}'::jsonb, key => 'notes.summary');
