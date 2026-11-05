import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import { migrationCommand } from '../changes/capture-schema'
import { workflowsSchema, type WorkflowsOptions } from './options'
import { checkpointsSql, commentVersion, functionsSql, indexesSql, tablesSql, workflowsTriggers, workflowsVersion } from './schema-sql'

// Only reads the catalogue: whether the runs table is there, the version of the run trigger's function, and whether
// both triggers are on their tables, since a trigger can be dropped while its function stays.
const readWorkflowsSchema = async (db: Db, schema: string) => {
  const runs = `${quoteIdent(schema)}."runs"`
  const { rows } = await sql<{ found: boolean; comment: string | null; triggers: number }>`select to_regclass(${runs}) is not null as found,
    (select obj_description(p.oid, 'pg_proc') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${schema} and p.proname = 'run_version') as comment,
    (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = ${schema} and not t.tgisinternal and t.tgname = any(${workflowsTriggers})) as triggers`.execute(db)
  const row = rows[0]!
  return { tables: row.found, current: row.found && commentVersion(row.comment) === workflowsVersion && row.triggers === workflowsTriggers.length }
}

/**
 * The SQL that brings the `workflows` schema to what `workflows` needs: its tables, indexes and the triggers that number a
 * workflow's versions and pin a run's; `undefined` when current. Tables are never dropped: a schema made before keeps
 * its `steps` table, which nothing reads or writes any more.
 */
export const workflowsMigration = async (db: Db, options: WorkflowsOptions = {}) => {
  const schema = workflowsSchema(options)
  const found = await readWorkflowsSchema(db, schema)
  if (found.current) return undefined
  const statements = [`create schema if not exists ${quoteIdent(schema)}`, ...(found.tables ? [] : [tablesSql(schema)]), checkpointsSql(schema), indexesSql(schema), functionsSql(schema)]
  return `${statements.join(';\n\n')};`
}

/** Refuses to go on while the `workflows` schema lacks what `workflows` needs; the project's migrations add it. */
export const checkWorkflowsSchema = async (db: Db, options: WorkflowsOptions = {}) => {
  const schema = workflowsSchema(options)
  const found = await readWorkflowsSchema(db, schema)
  if (found.current) return
  throw new Error(`The ${schema} schema is missing or behind this version of Protobase. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
