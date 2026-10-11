import { CompiledQuery } from 'kysely'
import { getConstructionPlans, getMigrationPlans } from 'pg-boss'
import type { Db } from '@protobase/query'
import { functionNames, functionsComment, functionsSql } from './functions-sql'

/** The schema the job queue lives in: pg-boss's tables and Protobase's functions. */
export const jobsSchema = 'jobs'

/** The schema version of the pinned pg-boss (its package.json `pgboss.schema`); bumped with pg-boss, deliberately. */
export const pgBossSchemaVersion = 45

/** The command that writes what the database lacks as the project's next migration. */
export const migrationCommand = 'protobase migration'

/**
 * A pg-boss plan as a migration the project applies in its own transaction: without its BEGIN and COMMIT, without the
 * timeouts it sets for that transaction, which would hold for the project's later migrations too, and with index
 * builds that are not `CONCURRENTLY`, which Postgres refuses in a transaction. Migrations run while nothing else
 * writes, so a plain index build only costs a lock nobody waits on.
 */
export const migrationStatements = (plan: string) => {
  const match = /^\s*BEGIN;\n\s*SET LOCAL lock_timeout = \d+;\n\s*SET LOCAL idle_in_transaction_session_timeout = \d+;\n([\s\S]*?)\n\s*COMMIT;\n?([\s\S]*)$/.exec(plan)
  if (!match) throw new Error(`Unexpected pg-boss plan:\n${plan.slice(0, 200)}`)
  return `${match[1]!.trim()}\n${match[2]}`.replace(/\b(CREATE (?:UNIQUE )?INDEX|DROP INDEX|REINDEX INDEX) CONCURRENTLY\b/gi, '$1').trim()
}

const rows = async <Row>(db: Db, text: string, parameters: unknown[] = []) => (await db.executeQuery<Row>(CompiledQuery.raw(text, parameters))).rows

/** What the database holds of the jobs schema: pg-boss's version, when installed, and whether Protobase's functions are current. */
export const readJobsSchema = async (db: Db) => {
  const [{ installed }] = (await rows<{ installed: boolean }>(db, `select to_regclass('${jobsSchema}.version') is not null as installed`)) as [{ installed: boolean }]
  if (!installed) return { pgBoss: undefined, functionsCurrent: false }
  const [version] = await rows<{ version: number }>(db, `select version from ${jobsSchema}.version`)
  const functions = await rows<{ name: string; comment: string | null }>(
    db,
    `select p.proname as name, obj_description(p.oid, 'pg_proc') as comment from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = any($2)`,
    [jobsSchema, functionNames],
  )
  const functionsCurrent = functionNames.every((name) => functions.some((found) => found.name === name && found.comment === functionsComment))
  return { pgBoss: version === undefined ? undefined : Number(version.version), functionsCurrent }
}

const newer = (version: number) =>
  new Error(`The jobs schema is at pg-boss schema version ${version}, newer than the ${pgBossSchemaVersion} this version of Protobase runs; upgrade Protobase`)

/**
 * The SQL that brings the jobs schema to what this version of Protobase runs: pg-boss's own construction plan when it
 * is missing, or its migration plan from the version installed, then Protobase's functions. `undefined` when current.
 */
export const jobsSchemaMigration = async (db: Db) => {
  const { pgBoss, functionsCurrent } = await readJobsSchema(db)
  if (pgBoss !== undefined && pgBoss > pgBossSchemaVersion) throw newer(pgBoss)
  if (pgBoss === pgBossSchemaVersion && functionsCurrent) return undefined
  const parts = []
  if (pgBoss === undefined) parts.push(migrationStatements(getConstructionPlans(jobsSchema)))
  else if (pgBoss < pgBossSchemaVersion) parts.push(migrationStatements(getMigrationPlans(jobsSchema, pgBoss)))
  parts.push(functionsSql(jobsSchema))
  return parts.join('\n\n')
}

/**
 * Refuses to go on while the jobs schema is missing or not the version this Protobase runs. The server never creates
 * or migrates it: the project's migrations do, before the new version serves.
 */
export const checkJobsSchema = async (db: Db) => {
  const { pgBoss, functionsCurrent } = await readJobsSchema(db)
  if (pgBoss !== undefined && pgBoss > pgBossSchemaVersion) throw newer(pgBoss)
  if (pgBoss === pgBossSchemaVersion && functionsCurrent) return
  const state = pgBoss === undefined ? 'missing' : 'behind this version of Protobase'
  throw new Error(`The jobs schema is ${state}. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
