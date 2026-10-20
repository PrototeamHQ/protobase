import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { connect } from '../db/connect'
import { runDoctor } from '../doctor/run'
import { runScaffold } from '../scaffold/run'
import { cronJobFilesInTheWay, writeCronJobs } from './cron-jobs-write'
import { convertedCronJobs } from './cron-plan'
import { importState, type ImportManifest } from './import-state'
import { loadScript, qualified } from './load-script'
import { runPgTool } from './pg-tools'
import { importReport } from './report'
import { existingTables, filledTables, otherTables } from './target-checks'

export type LoadOptions = { targetUrl: string; projectDir: string; migrationsDir: string; configDir: string }

/** Schemas the import restores that scaffolding leaves alone: Supabase Auth's and Storage's own tables are no resources. */
const platformSchemas = ['auth', 'storage']

/**
 * Fails unless every dumped table exists on the target, created by the applied migration, and holds no rows yet, and
 * the project has none of the files the converted pg_cron jobs go to.
 */
const checkReady = async (url: string, projectDir: string, manifest: ImportManifest) => {
  const inTheWay = cronJobFilesInTheWay(projectDir, convertedCronJobs(manifest.cronJobs))
  if (inTheWay.length > 0) throw new Error(`The project has ${inTheWay.map((file) => path.relative(projectDir, file)).join(', ')} already, where the import writes pg_cron's jobs; move them away first`)
  const sql = connect(url)
  try {
    const existing = new Set(await existingTables(sql, manifest.tables))
    const missing = manifest.tables.filter((table) => !existing.has(qualified(table)))
    if (missing.length > 0) {
      throw new Error(`The project's database lacks ${missing.length} of the imported tables, such as ${missing.slice(0, 5).map((table) => `${table.schema}.${table.table}`).join(', ')}: apply ${manifest.migration} with the project's migrations first`)
    }
    const filled = await filledTables(sql, manifest.tables)
    if (filled.length > 0) throw new Error(`The project's database already has rows in ${filled.slice(0, 5).join(', ')}; the import loads into empty tables only`)
  } finally {
    await sql.end()
  }
}

/** `protobase doctor`'s output on the config at `configDir`, or `undefined` when there is none. */
const doctorOutput = async (url: string, configDir: string) => {
  if (!existsSync(path.join(configDir, 'index.ts'))) return undefined
  let text = ''
  await runDoctor({ url, configDir }, (line) => (text += line))
  return text
}

/**
 * The import's second run, once the schema migration is applied: loads the data dump, with the replay of Vault's
 * secrets, pgmq's queues and pg_cron's jobs when the dump made one, in one transaction, deletes both, scaffolds the
 * config from the imported tables of the app's schemas, leaving the project's own alone, writes the pg_cron jobs it
 * converts as the project's recurring jobs, and writes the report.
 */
export const runLoadPhase = async (options: LoadOptions, out: (text: string) => void) => {
  const state = importState(options.projectDir)
  const manifest = await state.readManifest()
  if (!existsSync(path.join(options.migrationsDir, manifest.migration))) throw new Error(`The import's migration ${manifest.migration} is not in ${options.migrationsDir}; remove supabase-import/ and import again`)
  await checkReady(options.targetUrl, options.projectDir, manifest)

  const replay = state.hasReplay() ? state.replay : undefined
  await writeFile(state.load, loadScript(state.data, manifest.tables, replay), { mode: 0o600 })
  await runPgTool('psql', options.targetUrl, ['--no-psqlrc', '--quiet', '--single-transaction', '--set=ON_ERROR_STOP=1', `--file=${state.load}`])
  await rm(state.load)
  await rm(state.data)
  if (replay) await rm(replay)
  out(`loaded ${manifest.tables.reduce((sum, table) => sum + table.rows, 0)} rows into ${manifest.tables.length} tables; each count matches the source\n`)

  const schemas = manifest.schemas.filter((schema) => !platformSchemas.includes(schema))
  const sql = connect(options.targetUrl)
  const excludes = await otherTables(sql, schemas, manifest.tables).finally(() => sql.end())
  for (const schema of schemas) {
    await runScaffold({ url: options.targetUrl, target: schema, configDir: options.configDir, yes: true, dryRun: false, ui: [], excludes }, out)
  }
  const cron = convertedCronJobs(manifest.cronJobs)
  const jobsWired = await writeCronJobs(options.projectDir, cron)
  if (cron.length > 0) out(`wrote ${cron.length} of pg_cron's jobs as recurring jobs in jobs/\n`)
  await writeFile(state.report, importReport(manifest, await doctorOutput(options.targetUrl, options.configDir), jobsWired), { mode: 0o600 })
  out(`wrote ${path.relative(options.projectDir, state.report)}: what the import could not carry over\n`)
}
