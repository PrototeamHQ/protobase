import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import { migrationCommand } from '../changes/capture-schema'
import { hooksSql } from './hooks/hooks-sql'
import { revocationsSql } from './connections/revocations-sql'
import { stepCacheSql } from './cache/step-cache-sql'
import { storageSql } from './storage/storage-sql'
import { workflowsCustomStepsOn, workflowsSchema, workflowsStorageOn, type WorkflowsOptions } from './options'
import { checkpointsSql, commentVersion, definitionPartsSql, droppedSql, functionsSql, indexesSql, tablesSql, triggersSql, effectsSql, workflowsTriggers, workflowsVersion } from './schema-sql'
import { statusSql, statusTriggers } from './status-sql'
import { blockRunsSql } from './block-runs-sql'
import { taskTokensSql } from './task-tokens-sql'
import { customStepsSql, customStepsTables } from './custom-steps/custom-steps-sql'
import { runnersSql, runnersTables } from './custom-steps/runners-sql'

// Only reads the catalogue: whether the runs and triggers tables are there, the version of the run trigger's function,
// and whether both database triggers are on their tables, since a trigger can be dropped while its function stays.
const triggerNames = [...workflowsTriggers, ...statusTriggers]

// With `storage` on, the storage configurations table must be there too, so turning storage on later writes a migration;
// with `customSteps` on, the custom steps' tables and their runners'.
const readWorkflowsSchema = async (db: Db, schema: string, { storage, customSteps }: { storage: boolean; customSteps: boolean }) => {
  const runs = `${quoteIdent(schema)}."runs"`
  const triggerRows = `${quoteIdent(schema)}."triggers"`
  const configurations = `${quoteIdent(schema)}."storage_configurations"`
  const custom = sql.join([...customStepsTables, ...runnersTables].map((table) => sql`to_regclass(${`${quoteIdent(schema)}."${table}"`}) is not null`), sql` and `)
  const { rows } = await sql<{ found: boolean; trigger_rows: boolean; configurations: boolean; custom_steps: boolean; comment: string | null; triggers: number }>`select to_regclass(${runs}) is not null as found,
    to_regclass(${triggerRows}) is not null as trigger_rows,
    to_regclass(${configurations}) is not null as configurations,
    ${custom} as custom_steps,
    (select obj_description(p.oid, 'pg_proc') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${schema} and p.proname = 'run_version') as comment,
    (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = ${schema} and not t.tgisinternal and t.tgname = any(${triggerNames})) as triggers`.execute(db)
  const row = rows[0]!
  const current = row.found && row.trigger_rows && commentVersion(row.comment) === workflowsVersion && row.triggers === triggerNames.length && (!storage || row.configurations) && (!customSteps || row.custom_steps)
  return { tables: row.found, current }
}

// What the options turn on beside the workflows themselves, checked.
const turnedOn = (options: Pick<WorkflowsOptions, 'storage' | 'customSteps'>) => ({ storage: workflowsStorageOn(options), customSteps: workflowsCustomStepsOn(options) })

/**
 * The SQL that brings the `workflows` schema to what `workflows` needs: its tables, indexes and the triggers that number a
 * workflow's versions and pin a run's; `undefined` when current. A schema made before loses its `steps` table, which
 * runs no longer keep. The storage configurations table is added only with `storage`, the custom steps' tables, with
 * their runners and jobs, only with `customSteps`.
 */
export const workflowsMigration = async (db: Db, options: Pick<WorkflowsOptions, 'schema' | 'storage' | 'customSteps'> = {}) => {
  const schema = workflowsSchema(options)
  const on = turnedOn(options)
  const found = await readWorkflowsSchema(db, schema, on)
  if (found.current) return
  return workflowsSql(schema, { tables: found.tables, ...on })
}

/** The statements of a migration of the `workflows` schema: its tables only when missing, storage and custom steps only when on. */
export const workflowsSql = (schema: string, { tables, storage, customSteps = false }: { tables: boolean; storage: boolean; customSteps?: boolean }) => {
  const statements = [`create schema if not exists ${quoteIdent(schema)}`, ...(tables ? [] : [tablesSql(schema)]), definitionPartsSql(schema), checkpointsSql(schema), droppedSql(schema), triggersSql(schema), effectsSql(schema), revocationsSql(schema), hooksSql(schema), stepCacheSql(schema), indexesSql(schema), blockRunsSql(schema), taskTokensSql(schema), ...(storage ? [storageSql(schema)] : []), ...(customSteps ? [customStepsSql(schema), runnersSql(schema)] : []), functionsSql(schema), statusSql(schema)]
  return `${statements.join(';\n\n')};`
}

/** Refuses to go on while the `workflows` schema lacks what `workflows` needs; the project's migrations add it. */
export const checkWorkflowsSchema = async (db: Db, options: Pick<WorkflowsOptions, 'schema' | 'storage' | 'customSteps'> = {}) => {
  const schema = workflowsSchema(options)
  const found = await readWorkflowsSchema(db, schema, turnedOn(options))
  if (found.current) return
  throw new Error(`The ${schema} schema is missing or behind this version of Protobase. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
