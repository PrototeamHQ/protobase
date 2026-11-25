import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import { resourceEntry } from '../schema-modules/resource-difference'
import type { ModuleInput, ModuleModel, ResourceEntry, ResourceInput, ResourceReplaceable } from '../schema-modules/schema-module'
import { bucketsBody, bucketsComment, bucketsCommentPrefix, bucketsFunctionName, type BucketsTarget } from './buckets-sql'
import { qualifiedTable, type FormulaInput, type RollupInput } from './computed-input'
import { columnType } from './column-sql'
import { formulaComment, isFormulaComment } from './formula-sql'
import { rollupBody, rollupFunctionName, rollupsSchema, rollupTriggerName } from './rollup-sql'

const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows

type FoundColumn = { table: string; column: string; generated: boolean; type: string; comment: string | null }
type FoundFunction = { name: string; source: string; definer: boolean; triggers: { table: string; name: string; enabled: string }[] }
type FoundTable = { table: string; catalogue: string; comment: string | null }

const placeKey = (table: string, column: string) => JSON.stringify([table, column])

// Each table the input names, by how it names it, with its name as the catalogue qualifies it and its comment.
const readTables = async (db: Db, tables: readonly string[]) =>
  rowsOf(
    db,
    sql<FoundTable>`select t.name as "table", format('%I.%I', n.nspname, c.relname) as catalogue, obj_description(c.oid, 'pg_class') as comment
      from unnest(${tables}::text[]) as t(name) join pg_class c on c.oid = to_regclass(t.name) join pg_namespace n on n.oid = c.relnamespace`,
  )

// The columns the input names, each on its table.
const readColumns = async (db: Db, places: readonly { table: string; column: string }[]) =>
  rowsOf(
    db,
    sql<FoundColumn>`select p.table, p.column, a.attgenerated <> '' as generated, format_type(a.atttypid, a.atttypmod) as type, col_description(a.attrelid, a.attnum) as comment
      from unnest(${places.map(({ table }) => table)}::text[], ${places.map(({ column }) => column)}::text[]) as p("table", "column")
      join pg_attribute a on a.attrelid = to_regclass(p.table) and a.attname = p.column
      where a.attnum > 0 and not a.attisdropped`,
  )

// The functions of the rollups schema, with the tables and names of the triggers that call them.
const readFunctions = async (db: Db) =>
  rowsOf(
    db,
    sql<FoundFunction>`select p.proname as name, p.prosrc as source, p.prosecdef as definer,
      coalesce((select json_agg(json_build_object('table', format('%I.%I', ns.nspname, c.relname), 'name', t.tgname, 'enabled', t.tgenabled)) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace ns on ns.oid = c.relnamespace where t.tgfoid = p.oid and not t.tgisinternal), '[]') as triggers
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${rollupsSchema}`,
  )

const fieldName = ({ model, field }: Pick<FormulaInput, 'model' | 'field'>) => `${model.name}.${field.name}`

/**
 * The rollups and formulas as the database has them for `input`: step 1 once the rollups schema is there, and each
 * resource's objects found, at the digest of its input when they are what this version or an earlier one made of it,
 * else at none, so they are made again. Refuses a column or table of the project's own where the config declares one,
 * and a rollup's column of another type. `undefined` when it has none of them.
 */
export const readComputed = async (db: Db, input: ModuleInput, replaceables: readonly ResourceReplaceable[]): Promise<ModuleModel | undefined> => {
  const given = (name: string) => Object.entries(input.resources[name] ?? {})
  const targets = [...given('rollups'), ...given('time_rollups')].map(([, { input: target }]) => target as RollupInput | BucketsTarget)
  const tables = new Map((await readTables(db, [...new Set(targets.flatMap((target) => [target.table, target.fromTable]))])).map((found) => [found.table, found]))
  const columnPlaces = [...given('rollup_columns'), ...given('formulas')].map(([, entry]) => ({ table: qualifiedTable(entry.table), column: entry.column! }))
  const columns = new Map((await readColumns(db, columnPlaces)).map((found) => [placeKey(found.table, found.column), found]))
  const [schema] = await rowsOf(db, sql<{ found: boolean }>`select exists (select from pg_namespace where nspname = ${rollupsSchema}) as found`)
  const functions = schema!.found ? await readFunctions(db) : []
  const entries: Record<string, Record<string, ResourceEntry>> = {}
  const record = (replaceable: ResourceReplaceable, key: string, given: ResourceInput, current: boolean) => {
    const entry = resourceEntry(replaceable, input.names, given)
    entries[replaceable.name] = { ...entries[replaceable.name], [key]: current ? entry : { ...entry, digest: '' } }
  }
  const [rollupColumns, formulas, rollups, timeRollups] = replaceables as [ResourceReplaceable, ResourceReplaceable, ResourceReplaceable, ResourceReplaceable]
  for (const [key, entry] of given('rollup_columns')) {
    const target = entry.input as RollupInput
    const found = columns.get(placeKey(qualifiedTable(entry.table), entry.column!))
    if (!found) continue
    const name = `${target.table}.${quoteIdent(entry.column!)}`
    if (found.generated) throw new Error(`Column ${name} of rollup field "${fieldName(target)}" is a generated column; drop it in a migration, then write the rollup's with \`protobase migration\``)
    if (found.type !== columnType(target.field)) throw new Error(`Column ${name} of rollup field "${fieldName(target)}" is ${found.type}, not ${columnType(target.field)} as the field declares; change one of them`)
    record(rollupColumns, key, entry, true)
  }
  for (const [key, entry] of given('formulas')) {
    const target = entry.input as FormulaInput
    const found = columns.get(placeKey(qualifiedTable(entry.table), entry.column!))
    if (!found) continue
    const name = `${target.table}.${quoteIdent(entry.column!)}`
    if (!found.generated) throw new Error(`Column ${name} of formula field "${fieldName(target)}" is a plain column; drop or rename it in a migration, then write the formula's with \`protobase migration\``)
    if (!isFormulaComment(found.comment)) throw new Error(`Column ${name} of formula field "${fieldName(target)}" is a generated column of the project's own; drop it in a migration, or remove .formula()`)
    record(formulas, key, entry, found.comment === formulaComment(target.model, target.field) && found.type === columnType(target.field))
  }
  // A rollup's function names its tables as the catalogue qualifies them when an earlier version made it.
  const catalogued = (target: RollupInput) => ({ ...target, table: tables.get(target.table)?.catalogue ?? target.table, fromTable: tables.get(target.fromTable)?.catalogue ?? target.fromTable })
  for (const [key, entry] of given('rollups')) {
    const target = entry.input as RollupInput
    const fn = functions.find((found) => found.name === rollupFunctionName(entry.table, entry.column!))
    if (!fn) continue
    const from = tables.get(target.fromTable)?.catalogue
    const body = fn.source === rollupBody(target) || fn.source === rollupBody(catalogued(target))
    // Fired on every write but those of replication alone: 'O' fires in the origin and local roles, 'A' always.
    const [trigger] = fn.triggers
    const triggered = fn.triggers.length === 1 && trigger!.name === rollupTriggerName(target) && trigger!.table === from && ['O', 'A'].includes(trigger!.enabled)
    record(rollups, key, entry, fn.definer && body && triggered)
  }
  for (const [key, entry] of given('time_rollups')) {
    const target = entry.input as BucketsTarget
    const found = tables.get(target.table)
    if (!found) continue
    if (!found.comment?.startsWith(bucketsCommentPrefix)) throw new Error(`Table ${target.table} of time rollup "${target.model.name}" is a table of the project's own; drop or rename it in a migration, or name another table`)
    const fn = functions.find((candidate) => candidate.name === bucketsFunctionName(target))
    record(timeRollups, key, entry, found.comment === bucketsComment(target) && fn?.source === bucketsBody(target))
  }
  if (!schema!.found && Object.keys(entries).length === 0) return
  return { lastStep: schema!.found ? 1 : 0, replaceables: {}, ...(Object.keys(entries).length > 0 && { resources: entries }) }
}
