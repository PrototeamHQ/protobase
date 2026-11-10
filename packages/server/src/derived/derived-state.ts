import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { StoredRead } from './affected'
import { equalityOf } from './condition'
import type { RecordedRead } from './recorded-reads'

/** One record of one derived value. */
export type ValueRef = { name: string; key: string }

const pairs = (refs: readonly ValueRef[]) => sql`unnest(${refs.map((ref) => ref.name)}::text[], ${refs.map((ref) => ref.key)}::text[]) as t("name", "key")`

/** Marks the records' values stale, a record without one yet too, and moves each one's version on. */
export const markStale = async (db: Db, refs: readonly ValueRef[]) => {
  if (refs.length === 0) return
  await sql`insert into "derived"."values" ("name", "key", "status", "version") select t."name", t."key", 'stale', 1 from ${pairs(refs)}
    on conflict ("name", "key") do update set "status" = 'stale', "version" = "values"."version" + 1`.execute(db)
}

/** Drops the values of records that are gone, and what they read. */
export const forget = async (db: Db, refs: readonly ValueRef[]) => {
  if (refs.length === 0) return
  await sql`delete from "derived"."reads" r using ${pairs(refs)} where r."name" = t."name" and r."key" = t."key"`.execute(db)
  await sql`delete from "derived"."values" v using ${pairs(refs)} where v."name" = t."name" and v."key" = t."key"`.execute(db)
}

/** Marks the value recalculating and returns its version, the one the result is for. */
export const claim = async (db: Db, { name, key }: ValueRef) =>
  (await sql<{ version: string }>`insert into "derived"."values" ("name", "key", "status", "version") values (${name}, ${key}, 'recalculating', 1)
    on conflict ("name", "key") do update set "status" = 'recalculating' returning "version"::text as version`.execute(db)).rows[0]!.version

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

/**
 * Keeps a computed result, in the caller's transaction, when the value's version is still `version`: its reads, the
 * value, `current` and when. Returns whether the value differs from the one kept before, or `undefined` when a change
 * made it stale while it ran, so the result is dropped for the run that change queued.
 */
export const keep = async (trx: Db, { name, key }: ValueRef, version: string, result: Result, typesOf: (resource: string) => Record<string, string>) => {
  const { rows } = await sql<{ version: string; same: boolean }>`select "version"::text as version, "value" is not distinct from ${JSON.stringify(result.value)}::jsonb as same
    from "derived"."values" where "name" = ${name} and "key" = ${key} for update`.execute(trx)
  if (rows[0]?.version !== version) return undefined
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
  return !rows[0]!.same
}
