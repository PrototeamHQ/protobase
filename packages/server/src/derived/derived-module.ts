import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { jobsSchema } from '../jobs/schema'
import { hasIndexes } from '../has-indexes'
import { resourceEntry } from '../schema-modules/resource-difference'
import type { ModuleInput, ModuleModel, ResourceEntry, ResourceReplaceable, SchemaModule } from '../schema-modules/schema-module'
import { derivedName, derivedSchema, derivedTablesSql, fillJobName } from './derived-sql'

const quote = (text: string) => `'${text.replaceAll("'", "''")}'`

/**
 * Each derived value, by its name across resources: marked declared, with the job that computes its records once
 * enqueued in the same transaction. Once the config no longer declares it, its mark, state, reads and pending changes
 * go, so declaring it again fills it again.
 */
const values: ResourceReplaceable = {
  name: 'values',
  title: 'The declaration of a derived value, and the job that fills it',
  version: 1,
  compatibleFrom: 1,
  sql: (_names, input) => {
    const name = input as string
    return [
      `insert into "${derivedSchema}"."declared" ("name") values (${quote(name)}) on conflict do nothing;`,
      `select ${jobsSchema}.enqueue(${quote(fillJobName)}, ${quote(JSON.stringify({ name }))}::jsonb, key => ${quote(name)});`,
    ].join('\n')
  },
  drop: (_names, _table, _column, key) => ['declared', 'reads', 'pending', 'values'].map((table) => `delete from "${derivedSchema}"."${table}" where "name" = ${quote(key)};`).join('\n'),
  keptWhileOthers: false,
}

const tableOf = ({ table }: ResourceModel) => ({ ...(table.schema !== undefined && { schema: table.schema }), name: table.name })

/** What the derived module takes from the app: each derived value of `models`, by its name across resources. */
export const derivedInput = (models: readonly ResourceModel[]): ModuleInput => ({
  names: {},
  resources: {
    values: Object.fromEntries(models.flatMap((model) => (model.derived ?? []).map((value) => [derivedName(model.name, value.name), { table: tableOf(model), input: derivedName(model.name, value.name) }]))),
  },
})

const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows

/**
 * The derived schema as the database has it: step 1 once its tables, sequence and indexes are there, and each derived
 * value `declared` marks, current when the input declares it, else recorded at no digest on the table of its resource's
 * name, so the next migration drops its state. Refuses a schema of an earlier shape, which no step records.
 */
const readDerived = async (db: Db, input: ModuleInput): Promise<ModuleModel | undefined> => {
  const [found] = await rowsOf(
    db,
    sql<{ values: boolean; complete: boolean }>`select to_regclass('derived.values') is not null as values,
      to_regclass('derived.reads') is not null and to_regclass('derived.declared') is not null and to_regclass('derived.versions') is not null and to_regclass('derived.pending') is not null as complete`,
  )
  if (!found!.values) return
  const indexed = found!.complete && (await hasIndexes(db, derivedSchema, 'reads', ['reads_match', 'reads_value'])) && (await hasIndexes(db, derivedSchema, 'pending', ['pending_value']))
  if (!indexed) {
    throw new Error('The derived schema lacks its versions sequence, pending table or indexes, which no step of this version of Protobase records')
  }
  const declared = (await rowsOf(db, sql<{ name: string }>`select "name" from "derived"."declared"`)).map((row) => row.name)
  const given = input.resources[values.name] ?? {}
  const entries: Record<string, ResourceEntry> = {}
  for (const name of declared) {
    const wanted = given[name]
    entries[name] = wanted ? resourceEntry(values, input.names, wanted) : { version: values.version, digest: '', table: { name: name.slice(0, name.lastIndexOf('.')) } }
  }
  return { lastStep: 1, replaceables: {}, ...(declared.length > 0 && { resources: { [values.name]: entries } }) }
}

/**
 * The `derived` schema the resources' derived values keep their state in, and each value's declaration. Its tables are
 * never dropped.
 */
export const derivedModule: SchemaModule = {
  label: 'the derived schema',
  title: "The state of the resources' derived values and what they read",
  steps: [{ step: 1, name: 'derived', title: 'The derived schema: the values, what they read, the changes pending and the values declared', additive: true, sql: () => `${derivedTablesSql()};` }],
  replaceables: [],
  resourceReplaceables: [values],
  read: readDerived,
}
