import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { capturePlan, planSql, uncaptured, type CaptureState, type FoundTrigger } from './capture-plan'
import { isCaptured, quoteIdent, tableSql } from './capture-sql'
import { changesSchema, type EventsOptions } from './events-options'

/** The command that writes what the config needs as a migration file of the project. */
export const migrationCommand = 'protobase migration'

// A trigger's arguments are kept as bytes, each ended by a zero byte.
const triggerArgs = (hex: string) => {
  const bytes = new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)))
  return new TextDecoder().decode(bytes).split('\0').slice(0, -1)
}

const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows

// Only reads the catalogue.
const readCaptureState = async (db: Db, schema: string, models: readonly ResourceModel[]): Promise<CaptureState> => {
  const exists = async (table: string) => (await rowsOf(db, sql<{ found: boolean }>`select to_regclass(${`${quoteIdent(schema)}.${quoteIdent(table)}`}) is not null as found`))[0]?.found ?? false
  const [capture] = await rowsOf(
    db,
    sql<{ oid: string; source: string; definer: boolean }>`select p.oid::text as oid, p.prosrc as source, p.prosecdef as definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${schema} and p.proname = 'capture' and p.pronargs = 0`,
  )
  const tables: Record<string, string | null> = {}
  for (const model of models) {
    const [found] = await rowsOf(db, sql<{ oid: string | null }>`select to_regclass(${tableSql(model)})::oid::text as oid`)
    tables[model.name] = found?.oid ?? null
  }
  const oids = Object.values(tables).filter((oid) => oid !== null)
  const triggers = await rowsOf(
    db,
    sql<Omit<FoundTrigger, 'args'> & { args: string }>`select t.tgrelid::text as "table", format('%I.%I', ns.nspname, c.relname) as "tableSql", t.tgname as name,
      t.tgfoid::text as "function", t.tgtype::int as type, encode(t.tgargs, 'hex') as args
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace ns on ns.oid = c.relnamespace
      where not t.tgisinternal and (t.tgfoid::text = ${capture?.oid ?? ''} or t.tgrelid::text = any(${oids}::text[]))`,
  )
  return {
    outbox: await exists('outbox'),
    history: await exists('history'),
    ...(capture && { capture }),
    triggers: triggers.map((trigger) => ({ ...trigger, args: triggerArgs(trigger.args) })),
    tables,
  }
}

const plan = async (db: Db, models: readonly ResourceModel[], options?: EventsOptions) => {
  const schema = changesSchema(options)
  return { schema, plan: capturePlan(schema, models, await readCaptureState(db, schema, models.filter(isCaptured))) }
}

/**
 * The SQL that brings the database to the capture the resources' events and history need: the schema with the outbox
 * and `capture()`, the history table, and a trigger pair per resource with either, recreated when its fields changed;
 * triggers of resources without either any more are dropped. `undefined` when the database is current. Tables are
 * never dropped.
 */
export const changesMigration = async (db: Db, models: readonly ResourceModel[], options?: EventsOptions) => {
  const { schema, plan: found } = await plan(db, models, options)
  return planSql(schema, found)
}

/**
 * Refuses to go on while a resource's events or history would not be captured as declared: a missing or out-of-date
 * schema, history table or trigger. The server never changes the schema itself: the project's migrations do, before the
 * new version serves.
 */
export const checkChanges = async (db: Db, models: readonly ResourceModel[], options?: EventsOptions) => {
  if (!models.some(isCaptured)) return
  const { plan: found } = await plan(db, models, options)
  const missing = uncaptured(found, models)
  if (missing.length === 0) return
  throw new Error(
    `The changes of ${missing.join(', ')} are not captured as their events or history need: their triggers, the history table or the changes schema are missing or out of date. Write the change as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`,
  )
}
