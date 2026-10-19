import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { migrationCommand } from '../changes/capture-schema'
import { tableSql } from '../changes/capture-sql'
import { computedPlan, hasComputed, type ComputedState, type FoundColumn, type FoundFunction, type FoundTrigger } from './computed-plan'
import { rollupsSchema } from './rollup-sql'

const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows

// The resources with rollups or formulas, and those their rollups read.
const involved = (models: readonly ResourceModel[]) => {
  const computed = models.filter(hasComputed)
  const read = new Set(computed.flatMap((model) => Object.values(model.fields).flatMap((field) => (field.rollup ? [field.rollup.from] : []))))
  return models.filter((model) => hasComputed(model) || read.has(model.name))
}

// Only reads the catalogue.
const readComputedState = async (db: Db, models: readonly ResourceModel[]): Promise<ComputedState> => {
  const tables: ComputedState['tables'] = {}
  for (const model of involved(models)) {
    const [found] = await rowsOf(
      db,
      sql<{ oid: string; sql: string }>`select c.oid::text as oid, format('%I.%I', n.nspname, c.relname) as sql from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.oid = to_regclass(${tableSql(model)})`,
    )
    tables[model.name] = found ?? null
  }
  const wanted = models.filter(hasComputed).flatMap((model) =>
    Object.values(model.fields)
      .filter((field) => field.rollup || field.formula !== undefined)
      .flatMap((field) => (tables[model.name] ? [`${tables[model.name]!.oid}:${field.column}`] : [])),
  )
  const columns = await rowsOf(
    db,
    sql<FoundColumn>`select a.attrelid::text as "table", a.attname as name, format_type(a.atttypid, a.atttypmod) as type, a.attgenerated <> '' as generated, col_description(a.attrelid, a.attnum) as comment
      from pg_attribute a where a.attnum > 0 and not a.attisdropped and a.attrelid::text || ':' || a.attname = any(${wanted}::text[])`,
  )
  const functions = await rowsOf(
    db,
    sql<FoundFunction>`select p.oid::text as oid, p.proname as name, p.prosrc as source, p.prosecdef as definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${rollupsSchema}`,
  )
  const oids = Object.values(tables).flatMap((found) => (found ? [found.oid] : []))
  const triggers = await rowsOf(
    db,
    sql<FoundTrigger>`select t.tgrelid::text as "table", format('%I.%I', ns.nspname, c.relname) as "tableSql", t.tgname as name, t.tgfoid::text as "function"
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace ns on ns.oid = c.relnamespace
      where not t.tgisinternal and (t.tgfoid::text = any(${functions.map((found) => found.oid)}::text[]) or t.tgrelid::text = any(${oids}::text[]))`,
  )
  return { tables, columns, functions, triggers }
}

const plan = async (db: Db, models: readonly ResourceModel[]) => computedPlan(models, await readComputedState(db, models))

/**
 * The SQL that brings the database to the resources' rollup and formula fields: their columns, and for each rollup
 * the function and trigger that keep it, with its values set once; `undefined` when the database is current.
 */
export const computedMigration = async (db: Db, models: readonly ResourceModel[]) => {
  const { statements } = await plan(db, models)
  return statements.length === 0 ? undefined : `${statements.join(';\n\n')};`
}

/**
 * Refuses to go on while a rollup or formula field's column, function or trigger is missing or out of date. The server
 * never changes the schema itself: the project's migrations do, before the new version serves. Reads nothing without
 * such fields.
 */
export const checkComputed = async (db: Db, models: readonly ResourceModel[]) => {
  if (!models.some(hasComputed)) return
  const { behind } = await plan(db, models)
  if (behind.length === 0) return
  throw new Error(
    `The rollup and formula fields ${behind.join(', ')} are not kept by the database as declared: their columns, functions or triggers are missing or out of date. Write the change as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`,
  )
}
