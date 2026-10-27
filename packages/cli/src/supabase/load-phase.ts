import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { writeAuthMigration } from '../auth/write-migration'
import { connect } from '../db/connect'
import { runDoctor } from '../doctor/run'
import { runScaffold } from '../scaffold/run'
import { loadProjectAuth } from '../users/load-auth'
import { cronJobFilesInTheWay, writeCronJobs } from './cron-jobs-write'
import { convertedCronJobs } from './cron-plan'
import { providerCounts } from './identity-providers'
import { importState, type ImportManifest } from './import-state'
import { loadScript, qualified } from './load-script'
import { authStorageSchemas } from './platform-schemas'
import { writeMigration } from './migration-files'
import { runPgTool } from './pg-tools'
import { importReport } from './report'
import { existingTables, filledTables, otherTables } from './target-checks'
import { accountsMigration } from './users-migrations'

export type LoadOptions = { targetUrl: string; projectDir: string; migrationsDir: string; configDir: string }

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

/** `protobase doctor`'s output on the config at `configDir` of the project in `projectDir`, or `undefined` when there is none. */
const doctorOutput = async (url: string, configDir: string, projectDir: string) => {
  if (!existsSync(path.join(configDir, 'index.ts'))) return undefined
  let text = ''
  await runDoctor({ url, configDir, projectDir }, (line) => (text += line))
  return text
}

/**
 * The import's second run, once the schema migration is applied: loads the data dump, with the replay of Vault's
 * secrets, pgmq's queues and pg_cron's jobs when the dump made one, in one transaction, deletes both, scaffolds the
 * config from the imported tables of the app's schemas, leaving the project's own alone and making those of the
 * `supabase_realtime` publication live, writes the pg_cron jobs it converts as the project's recurring jobs, writes
 * the migrations that let Supabase's users sign in with Better Auth (its own tables, as `protobase auth migration`
 * plans them on the loaded auth.users, then the users' columns and accounts), and writes the report. The project's
 * auth keeps a connection pool open, so the process must end itself.
 */
export const runLoadPhase = async (options: LoadOptions, out: (text: string) => void) => {
  const state = importState(options.projectDir)
  const manifest = await state.readManifest()
  if (!existsSync(path.join(options.migrationsDir, manifest.migration))) throw new Error(`The import's migration ${manifest.migration} is not in ${options.migrationsDir}; remove supabase-import/ and import again`)
  await checkReady(options.targetUrl, options.projectDir, manifest)
  // Loaded before the data, so a project whose auth does not load fails while the import can still run again.
  const auth = await loadProjectAuth(options.projectDir)

  const replay = state.hasReplay() ? state.replay : undefined
  await writeFile(state.load, loadScript(state.data, manifest.tables, replay), { mode: 0o600 })
  await runPgTool('psql', options.targetUrl, ['--no-psqlrc', '--quiet', '--single-transaction', '--set=ON_ERROR_STOP=1', `--file=${state.load}`])
  await rm(state.load)
  await rm(state.data)
  if (replay) await rm(replay)
  out(`loaded ${manifest.tables.reduce((sum, table) => sum + table.rows, 0)} rows into ${manifest.tables.length} tables; each count matches the source\n`)

  const schemas = manifest.schemas.filter((schema) => !authStorageSchemas.includes(schema))
  const sql = connect(options.targetUrl)
  const excludes = await otherTables(sql, schemas, manifest.tables).finally(() => sql.end())
  const realtime = manifest.realtimeTables.map((table) => `${table.schema}.${table.table}`)
  const live: string[] = []
  for (const schema of schemas) {
    const plan = await runScaffold({ url: options.targetUrl, target: schema, configDir: options.configDir, yes: true, dryRun: false, ui: [], excludes, live: realtime }, out)
    live.push(...plan.live)
  }
  const cron = convertedCronJobs(manifest.cronJobs)
  const jobsWired = await writeCronJobs(options.projectDir, cron)
  if (cron.length > 0) out(`wrote ${cron.length} of pg_cron's jobs as recurring jobs in jobs/\n`)

  const authFile = await writeAuthMigration({ auth, dir: options.migrationsDir, name: 'auth' })
  if (authFile) out(`wrote ${path.relative(options.projectDir, authFile)}, Better Auth's tables next to auth.users\n`)
  const accountsFile = await writeMigration(options.migrationsDir, 'supabase_accounts', accountsMigration())
  out(`wrote ${path.relative(options.projectDir, path.join(options.migrationsDir, accountsFile))}, the users' accounts with their Supabase passwords and social providers\n`)

  const target = connect(options.targetUrl)
  const providers = await providerCounts(target).finally(() => target.end())
  await writeFile(state.report, importReport(manifest, await doctorOutput(options.targetUrl, options.configDir, options.projectDir), jobsWired, live, providers), { mode: 0o600 })
  out(`wrote ${path.relative(options.projectDir, state.report)}: what the import could not carry over\n`)
  out("next: apply the migrations with the project's migrations; Supabase's users then sign in with their own passwords\n")
}
