import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import { migrationCommand } from '../changes/capture-schema'
import { workflowsSchema, type WorkflowsOptions } from './options'
import { commentVersion, indexesSql, runStartSql, tablesSql, workflowsVersion } from './schema-sql'

// Only reads the catalogue: whether the steps table is there, and the version of the run trigger's function.
const readWorkflowsSchema = async (db: Db, schema: string) => {
  const steps = `${quoteIdent(schema)}."steps"`
  const { rows } = await sql<{ found: boolean; comment: string | null }>`select to_regclass(${steps}) is not null as found,
    (select obj_description(p.oid, 'pg_proc') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${schema} and p.proname = 'run_version') as comment`.execute(db)
  const row = rows[0]!
  return { tables: row.found, version: commentVersion(row.comment) }
}

/**
 * The SQL that brings the `workflows` schema to what `workflows` needs: its tables, indexes and the trigger that pins a
 * run's version; `undefined` when current. Tables are never dropped.
 */
export const workflowsMigration = async (db: Db, options: WorkflowsOptions = {}) => {
  const schema = workflowsSchema(options)
  const found = await readWorkflowsSchema(db, schema)
  if (found.tables && found.version === workflowsVersion) return undefined
  const statements = [`create schema if not exists ${quoteIdent(schema)}`, ...(found.tables ? [] : [tablesSql(schema)]), indexesSql(schema), runStartSql(schema)]
  return `${statements.join(';\n\n')};`
}

/** Refuses to go on while the `workflows` schema lacks what `workflows` needs; the project's migrations add it. */
export const checkWorkflowsSchema = async (db: Db, options: WorkflowsOptions = {}) => {
  const schema = workflowsSchema(options)
  const found = await readWorkflowsSchema(db, schema)
  if (found.tables && found.version === workflowsVersion) return
  throw new Error(`The ${schema} schema is missing or behind this version of Protobase. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
