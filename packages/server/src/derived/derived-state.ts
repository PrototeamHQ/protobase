import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { touches, type ChangedRecord, type StoredRead } from './affected'
import { equalityOf } from './condition'
import type { RecordedRead } from './recorded-reads'

/** One record of one derived value. */
export type ValueRef = { name: string; key: string }

const pairs = (refs: readonly ValueRef[]) => sql`unnest(${refs.map((ref) => ref.name)}::text[], ${refs.map((ref) => ref.key)}::text[]) as t("name", "key")`

const nextVersion = sql`nextval('"derived"."versions"')`

/** Marks the records' values stale, a record without one yet too, each with a version none had before. */
export const markStale = async (db: Db, refs: readonly ValueRef[]) => {
  if (refs.length === 0) return
  await sql`insert into "derived"."values" ("name", "key", "status", "version") select t."name", t."key", 'stale', ${nextVersion} from ${pairs(refs)}
    on conflict ("name", "key") do update set "status" = 'stale', "version" = ${nextVersion}`.execute(db)
}

/** Drops the values of records that are gone, and what they read. */
export const forget = async (db: Db, refs: readonly ValueRef[]) => {
  if (refs.length === 0) return
  await sql`delete from "derived"."pending" p using ${pairs(refs)} where p."name" = t."name" and p."key" = t."key"`.execute(db)
  await sql`delete from "derived"."reads" r using ${pairs(refs)} where r."name" = t."name" and r."key" = t."key"`.execute(db)
  await sql`delete from "derived"."values" v using ${pairs(refs)} where v."name" = t."name" and v."key" = t."key"`.execute(db)
}

/**
 * Marks the value recalculating and returns its version, the one the result is for. Changes kept for an earlier run
 * landed before this one reads, so it sees them.
 */
export const claim = async (db: Db, { name, key }: ValueRef) => {
  await sql`delete from "derived"."pending" where "name" = ${name} and "key" = ${key}`.execute(db)
  return (await sql<{ version: string }>`insert into "derived"."values" ("name", "key", "status", "version") values (${name}, ${key}, 'recalculating', ${nextVersion})
    on conflict ("name", "key") do update set "status" = 'recalculating' returning "version"::text as version`.execute(db)).rows[0]!.version
}

/**
 * The records of `names` whose run is under way, locked until the dispatch ends so a run's result is kept before or
 * after it, never meanwhile. A run's reads are kept only when it ends, so a change meanwhile may touch a read no row
 * holds yet, as on a record's first run.
 */
export const recalculating = async (db: Db, names: readonly string[]): Promise<ValueRef[]> => {
  if (names.length === 0) return []
  const { rows } = await sql<ValueRef>`select "name", "key" from "derived"."values" where "status" = 'recalculating' and "name" = any(${names}::text[])
    order by "name", "key" for update`.execute(db)
  return rows
}

/** Keeps changes that land while a record's run is under way, which `keep` weighs against the reads the run made. */
export const holdPending = async (db: Db, held: readonly (ValueRef & { change: ChangedRecord })[]) => {
  if (held.length === 0) return
  await sql`insert into "derived"."pending" ("name", "key", "change") select r."name", r."key", r."change"
    from jsonb_to_recordset(${JSON.stringify(held)}::jsonb) as r("name" text, "key" text, "change" jsonb)`.execute(db)
}

/**
 * The reads of `names`' records that the changes' records may touch: those with an equality a changed record holds,
 * and those without one. One query for a whole dispatch.
 */
export const candidateReads = async (db: Db, resources: readonly string[], keys: readonly [string, string, string][]): Promise<StoredRead[]> => {
  if (resources.length === 0) return []
  const { rows } = await sql<StoredRead>`select distinct r."name", r."key", r."resource", r."condition", r."fields" from "derived"."reads" r
    where r."resource" = any(${resources}::text[]) and (r."eq_field" is null
      or (r."resource", r."eq_field", r."eq_value") in (select * from unnest(${keys.map((k) => k[0])}::text[], ${keys.map((k) => k[1])}::text[], ${keys.map((k) => k[2])}::text[])))`.execute(db)
  return rows
}

export type Result = { value: unknown; reads: RecordedRead[]; flipsAt: Date | undefined }

/** What became of a result: `dropped` for a change that made it stale and queued a run, `touched` for a change during the run that touched one of its reads, else whether the value differs from the one kept before. */
export type Kept = 'dropped' | 'touched' | 'same' | 'changed'

/**
 * Keeps a computed result, in the caller's transaction, when the value's version is still `version` and no change kept
 * while it ran touches one of its reads: its reads, the value, `current` and when.
 */
export const keep = async (trx: Db, { name, key }: ValueRef, version: string, result: Result, typesOf: (resource: string) => Record<string, string>): Promise<Kept> => {
  const { rows } = await sql<{ version: string; same: boolean }>`select "version"::text as version, "value" is not distinct from ${JSON.stringify(result.value)}::jsonb as same
    from "derived"."values" where "name" = ${name} and "key" = ${key} for update`.execute(trx)
  if (rows[0]?.version !== version) return 'dropped'
  const pending = (await sql<{ change: ChangedRecord }>`delete from "derived"."pending" where "name" = ${name} and "key" = ${key} returning "change"`.execute(trx)).rows
  if (pending.some(({ change }) => result.reads.some((read) => touches(read, change, typesOf(change.resource))))) return 'touched'
  await sql`delete from "derived"."reads" where "name" = ${name} and "key" = ${key}`.execute(trx)
  const reads = result.reads.map((read) => {
    const equality = equalityOf(read.condition, typesOf(read.resource))
    return { resource: read.resource, eq_field: equality?.field ?? null, eq_value: equality?.value ?? null, condition: read.condition, fields: read.fields }
  })
  if (reads.length > 0) {
    await sql`insert into "derived"."reads" ("name", "key", "resource", "eq_field", "eq_value", "condition", "fields")
      select ${name}, ${key}, r."resource", r."eq_field", r."eq_value", r."condition", r."fields"
      from jsonb_to_recordset(${JSON.stringify(reads)}::jsonb) as r("resource" text, "eq_field" text, "eq_value" text, "condition" jsonb, "fields" jsonb)`.execute(trx)
  }
  await sql`update "derived"."values" set "status" = 'current', "value" = ${JSON.stringify(result.value)}::jsonb, "computed_at" = now(), "flips_at" = ${result.flipsAt ?? null}
    where "name" = ${name} and "key" = ${key}`.execute(trx)
  return rows[0]!.same ? 'same' : 'changed'
}
