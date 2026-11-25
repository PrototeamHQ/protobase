import type { ResourceModel } from '@protobase/schema'

/** The schema derived values are kept in: their state, what they read and which are declared. */
export const derivedSchema = 'derived'

/** The job that computes every record of a newly declared derived value once. */
export const fillJobName = 'derived.fill'

/** A derived value's name across resources, as its state and jobs hold it: `<resource>.<name>`. */
export const derivedName = (resource: string, name: string) => `${resource}.${name}`

/** Every derived value of the models, by its name across resources. */
export const derivedNames = (models: readonly ResourceModel[]) => models.flatMap((model) => (model.derived ?? []).map((value) => derivedName(model.name, value.name)))

const indexes = [
  ['reads_match', '"reads" ("resource", "eq_field", "eq_value")'],
  ['reads_value', '"reads" ("name", "key")'],
  ['pending_value', '"pending" ("name", "key")'],
] as const

/**
 * `values`, a row per record of a derived value: whether it is current, stale or recalculating, `version` taken from
 * the `versions` sequence by every change that made it stale, so a record deleted and made again never reuses one, the value as JSON, and when it was computed and when its clock flips next. `reads`,
 * a row per read it depends on, with an equality every matching row has (`eq_field`, `eq_value`) when it has one, which
 * the index finds a change's candidates by. `pending`, the changes to a resource a record's run under way may read,
 * weighed against its reads once it ends. `declared`, the derived values whose records the migrations have filled.
 */
export const derivedTablesSql = () => `create schema if not exists "${derivedSchema}";

create sequence if not exists "${derivedSchema}"."versions";

create table if not exists "${derivedSchema}"."values" (
  "name" text not null,
  "key" text not null,
  "status" text not null check ("status" in ('current', 'stale', 'recalculating')),
  "version" bigint not null,
  "value" jsonb,
  "computed_at" timestamptz,
  "flips_at" timestamptz,
  primary key ("name", "key")
);

create table if not exists "${derivedSchema}"."reads" (
  "name" text not null,
  "key" text not null,
  "resource" text not null,
  "eq_field" text,
  "eq_value" text,
  "condition" jsonb not null,
  "fields" jsonb
);

create table if not exists "${derivedSchema}"."pending" (
  "name" text not null,
  "key" text not null,
  "change" jsonb not null
);

create table if not exists "${derivedSchema}"."declared" ("name" text primary key);

${indexes.map(([name, on]) => `create index if not exists "${name}" on "${derivedSchema}".${on}`).join(';\n')}`
