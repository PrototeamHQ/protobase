import { CompiledQuery } from 'kysely'
import type { Db } from '@protobase/query'
import { moduleDifference } from '../schema-modules/module-difference'
import { noInput, type ModuleModel, type SchemaModule } from '../schema-modules/schema-module'
import { functionsSql, functionsVersion } from './functions-sql'
import { jobsSchema } from './schema'
import { pgBoss45 } from './steps/001-pg-boss-45'

/** The pg-boss schema version of each step that installs or migrates pg-boss, by step: pg-boss stays pinned to the last. */
export const pgBossSteps: Record<number, number> = { 1: 45 }

const rows = async <Row>(db: Db, text: string, parameters: unknown[] = []) => (await db.executeQuery<Row>(CompiledQuery.raw(text, parameters))).rows

const commentVersion = (comment: string | null) => {
  const found = comment && /^Protobase jobs (\d+)$/.exec(comment)
  return found ? Number(found[1]) : undefined
}

/** Protobase's functions in the jobs schema by the signature `functionsSql` makes them with, so an overload of one is not it. */
const functionSignatures = ['enqueue(text, jsonb, timestamptz, text, text, integer, jsonb)', 'enqueue(text, jsonb, timestamptz, text, text, integer)', 'next_due()', 'failed_retry()', 'failed_delete()']

/**
 * The functions' part of the jobs schema's model from the version each function's comment names, `undefined` for one
 * missing or without a version: the oldest known version, so replacing it from there says what it breaks, or absent
 * when one is missing and none known is older, so the functions are written again as new. Refuses a version newer than
 * this version of Protobase writes.
 */
export const functionsModel = (versions: readonly (number | undefined)[]): Record<string, number> => {
  const known = versions.filter((version) => version !== undefined)
  const newest = Math.max(...known)
  if (newest > functionsVersion) {
    throw new Error(`Protobase's functions of the jobs schema are at version ${newest}, newer than the ${functionsVersion} this version of Protobase writes: upgrade Protobase`)
  }
  if (known.length === 0) return {}
  const oldest = Math.min(...known)
  if (known.length < versions.length && oldest === functionsVersion) return {}
  return { functions: oldest }
}

/**
 * The jobs schema as the database has it: pg-boss's version as the step that installs it, and Protobase's functions as
 * `functionsModel` reads them. Refuses a pg-boss version no step records.
 */
const readJobs = async (db: Db): Promise<ModuleModel | undefined> => {
  const [{ installed }] = (await rows<{ installed: boolean }>(db, `select to_regclass('${jobsSchema}.version') is not null as installed`)) as [{ installed: boolean }]
  if (!installed) return
  const [found] = await rows<{ version: number }>(db, `select version from ${jobsSchema}.version`)
  const pgBoss = Number(found?.version)
  const step = Object.entries(pgBossSteps).find(([, version]) => version === pgBoss)?.[0]
  const pinned = Object.values(pgBossSteps).at(-1)!
  if (pgBoss > pinned) {
    throw new Error(`The jobs schema is at pg-boss schema version ${pgBoss}, newer than the ${pinned} this version of Protobase records: upgrade Protobase`)
  }
  if (step === undefined) {
    throw new Error(
      `The jobs schema is at pg-boss schema version ${pgBoss}, which no step of this version of Protobase records`,
    )
  }
  const functions = await rows<{ comment: string | null }>(
    db,
    `select obj_description(to_regprocedure(signature), 'pg_proc') as comment from unnest($1::text[]) with ordinality as s(signature, n) order by n`,
    [functionSignatures.map((signature) => `${jobsSchema}.${signature}`)],
  )
  return { lastStep: Number(step), replaceables: functionsModel(functions.map((one) => commentVersion(one.comment))) }
}

/**
 * The jobs schema: pg-boss's tables, installed by its own plan copied into a step for each pg-boss version Protobase
 * pins, and Protobase's functions over them. pg-boss stays pinned to an exact version; a bump copies its migration
 * plan into the next step by hand, reviewed like any step.
 */
export const jobsModule: SchemaModule = {
  label: 'the jobs schema',
  title: 'The jobs schema this version of Protobase needs',
  steps: [{ step: 1, name: 'pg_boss_45', title: "pg-boss's tables at its schema version 45", additive: true, sql: () => pgBoss45 }],
  // Not marked compatible with an earlier version: the code of one before it is not known to run on them.
  replaceables: [{ name: 'functions', title: "Protobase's functions of the jobs schema", version: functionsVersion, compatibleFrom: functionsVersion, sql: () => functionsSql(jobsSchema) }],
  resourceReplaceables: [],
  read: readJobs,
}

/** The whole jobs schema, as a migration writes it on a database without it. */
export const jobsSchemaSql = () => moduleDifference(jobsModule, noInput, undefined).sql!
