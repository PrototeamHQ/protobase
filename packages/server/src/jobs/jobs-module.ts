import { CompiledQuery } from 'kysely'
import type { Db } from '@protobase/query'
import { moduleDifference } from '../schema-modules/module-difference'
import type { ModuleModel, SchemaModule } from '../schema-modules/schema-module'
import { functionNames, functionsSql, functionsVersion } from './functions-sql'
import { jobsSchema } from './schema'
import { pgBoss45 } from './steps/001-pg-boss-45'

/** The pg-boss schema version of each step that installs or migrates pg-boss, by step: pg-boss stays pinned to the last. */
export const pgBossSteps: Record<number, number> = { 1: 45 }

const rows = async <Row>(db: Db, text: string, parameters: unknown[] = []) => (await db.executeQuery<Row>(CompiledQuery.raw(text, parameters))).rows

const commentVersion = (comment: string | null) => {
  const found = comment && /^Protobase jobs (\d+)$/.exec(comment)
  return found ? Number(found[1]) : undefined
}

/**
 * The jobs schema as the database has it: pg-boss's version as the step that installs it, and Protobase's functions at
 * the oldest version their comments name, or absent when one is missing or carries no version. Refuses a pg-boss
 * version no step records.
 */
const readJobs = async (db: Db): Promise<ModuleModel | undefined> => {
  const [{ installed }] = (await rows<{ installed: boolean }>(db, `select to_regclass('${jobsSchema}.version') is not null as installed`)) as [{ installed: boolean }]
  if (!installed) return
  const [found] = await rows<{ version: number }>(db, `select version from ${jobsSchema}.version`)
  const pgBoss = Number(found?.version)
  const step = Object.entries(pgBossSteps).find(([, version]) => version === pgBoss)?.[0]
  if (step === undefined) {
    throw new Error(
      `The jobs schema is at pg-boss schema version ${pgBoss}, which no step of this version of Protobase records: bring it to version ${pgBossSteps[1]} with \`protobase migration\` and \`protobase migrate\` of Protobase 0.14.2 first, then run this command again`,
    )
  }
  const functions = await rows<{ name: string; comment: string | null }>(
    db,
    `select p.proname as name, obj_description(p.oid, 'pg_proc') as comment from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = any($2) order by p.proname`,
    [jobsSchema, functionNames],
  )
  const versions = functionNames.map((name) => commentVersion(functions.find((one) => one.name === name)?.comment ?? null))
  const all = versions.every((version) => version !== undefined)
  return { lastStep: Number(step), replaceables: all ? { functions: Math.min(...(versions as number[])) } : {} }
}

/**
 * The jobs schema: pg-boss's tables, installed by its own plan copied into a step for each pg-boss version Protobase
 * pins, and Protobase's functions over them. pg-boss stays pinned to an exact version; a bump copies its migration
 * plan into the next step by hand, reviewed like any step.
 */
export const jobsModule: SchemaModule = {
  label: 'the jobs schema',
  title: 'The jobs schema this version of Protobase needs',
  steps: [{ step: 1, name: 'pg_boss_45', title: "pg-boss's tables at its schema version 45", additive: true, sql: pgBoss45 }],
  // Not marked compatible with an earlier version: the code of one before it is not known to run on them.
  replaceables: [{ name: 'functions', title: "Protobase's functions of the jobs schema", version: functionsVersion, compatibleFrom: functionsVersion, sql: functionsSql(jobsSchema) }],
  read: readJobs,
}

/** The whole jobs schema, as a migration writes it on a database without it. */
export const jobsSchemaSql = () => moduleDifference(jobsModule, undefined).sql!
