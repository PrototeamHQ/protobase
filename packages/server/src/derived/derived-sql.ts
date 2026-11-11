import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { migrationCommand } from '../changes/capture-schema'
import { hasIndexes } from '../has-indexes'
import { jobsSchema } from '../jobs/schema'

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
] as const

/**
 * `values`, a row per record of a derived value: whether it is current, stale or recalculating, `version` taken from
 * the `versions` sequence by every change that made it stale, so a record deleted and made again never reuses one, the value as JSON, and when it was computed and when its clock flips next. `reads`,
 * a row per read it depends on, with an equality every matching row has (`eq_field`, `eq_value`) when it has one, which
 * the index finds a change's candidates by. `declared`, the derived values whose records the migrations have filled.
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

create table if not exists "${derivedSchema}"."declared" ("name" text primary key);

${indexes.map(([name, on]) => `create index if not exists "${name}" on "${derivedSchema}".${on}`).join(';\n')}`

// Only reads the catalogue.
const hasTables = async (db: Db) =>
  (await sql<{ found: boolean }>`select to_regclass('derived.versions') is not null and to_regclass('derived.values') is not null and to_regclass('derived.reads') is not null and to_regclass('derived.declared') is not null as found`.execute(db)).rows[0]!.found

const declared = async (db: Db) => new Set((await sql<{ name: string }>`select "name" from "derived"."declared"`.execute(db)).rows.map((row) => row.name))

const quote = (text: string) => `'${text.replaceAll("'", "''")}'`

/**
 * The SQL that adds the `derived` schema and its tables, and for each derived value not declared before, marks it
 * declared and enqueues the job that computes its records once. A value no longer declared loses its mark, state and
 * reads, so declaring it again fills it again. `undefined` when there is nothing to do.
 */
export const derivedMigration = async (db: Db, models: readonly ResourceModel[]) => {
  const names = derivedNames(models)
  const exists = await hasTables(db)
  if (names.length === 0 && !exists) return undefined
  const tables = names.length === 0 || (exists && (await hasIndexes(db, derivedSchema, 'reads', indexes.map(([name]) => name))))
  const known = exists ? await declared(db) : new Set<string>()
  const fresh = names.filter((name) => !known.has(name))
  const gone = [...known].filter((name) => !names.includes(name))
  if (tables && fresh.length === 0 && gone.length === 0) return undefined
  const removals = gone.flatMap((name) => ['declared', 'reads', 'values'].map((table) => `delete from "${derivedSchema}"."${table}" where "name" = ${quote(name)}`))
  const fills = fresh.flatMap((name) => [
    `insert into "${derivedSchema}"."declared" ("name") values (${quote(name)}) on conflict do nothing`,
    `select ${jobsSchema}.enqueue(${quote(fillJobName)}, ${quote(JSON.stringify({ name }))}::jsonb, key => ${quote(name)})`,
  ])
  return [...(tables ? [] : [`${derivedTablesSql()};`]), ...[...removals, ...fills].map((statement) => `${statement};`)].join('\n\n')
}

/** Refuses to go on while a resource has derived values and the database lacks their tables; the project's migrations add them. */
export const checkDerived = async (db: Db, models: readonly ResourceModel[]) => {
  if (derivedNames(models).length === 0) return
  if (await hasTables(db)) return
  throw new Error(`The derived schema is missing, and resources with .derived() keep their values' state in it. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
