import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'
import { connect, type Sql } from '../db/connect'
import { isSchedule } from '@protobase/server'
import { importedUsersConfig, planAuthConfig } from './auth-config'
import { checkoutMarkers } from './checkout'
import { cronPlan } from './cron-plan'
import { planFunctions } from './functions/plan-functions'
import { writeFunctions } from './functions/write-functions'
import { importPlan, probedExtensions } from './import-plan'
import { importState, type ImportManifest } from './import-state'
import { writeMigration } from './migration-files'
import { runPgTool } from './pg-tools'
import { databaseMarkers, missingMarkers } from './platform-schemas'
import { realtimeMigration, realtimePolicies } from './realtime-policies'
import { replayScript } from './replay'
import { schemaMigration } from './schema-migration'
import { countSsoUsers, refuseSsoUsers } from './sso-users'
import { appSchemas, cronJobs, cronTimezone, dumpedTables, extensions, httpTriggers, hypertables, pgmqQueues, pgsodiumColumns, platformMigrationTables, realtimeTables, routinesIn, tablesSize, vaultSecretValues, vaultSecrets } from './source-facts'
import { authStoreMigrations } from './store-migrations'
import { ensureApiRoles, existingSchemas, existingTables } from './target-checks'
import { creatableExtensions } from './target-extensions'
import { usersColumnsMigration } from './users-migrations'

export type DumpOptions = { sourceUrl: string; targetUrl: string; projectDir: string; migrationsDir: string }

/** Fails unless the database at `sql` is Supabase's: its auth and storage schemas, and its own admin role. */
const checkSupabase = async (sql: Sql) => {
  const markers = await databaseMarkers(sql)
  const missing = missingMarkers(markers)
  if (missing.length > 0) throw new Error(`The source database is not a Supabase database: it lacks the ${missing.join(' and ')}`)
  return markers
}

/** Which of `names` the project's database lets the importing role create. */
const targetExtensions = async (url: string, names: string[]) => {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    return await creatableExtensions(sql, names)
  } finally {
    await sql.end()
  }
}

/**
 * What the source holds, read in the transaction whose snapshot the dumps take, so all of it is of one moment, with
 * what the import does with it on the project's database at `targetUrl`; and the replay of what the dump cannot carry.
 */
const readSource = async (sql: Sql, targetUrl: string) => {
  const schemas = await appSchemas(sql)
  const tables = await dumpedTables(sql, schemas)
  const sourceExtensions = await extensions(sql)
  const triggers = await httpTriggers(sql, schemas)
  const plan = importPlan({ extensions: sourceExtensions, httpTriggers: triggers }, await targetExtensions(targetUrl, probedExtensions(sourceExtensions)))
  const secrets = plan.vault ? await vaultSecretValues(sql) : undefined
  const queues = await pgmqQueues(sql)
  const replayed = plan.queues ? (queues ?? []).filter((queue) => !queue.partitioned) : []
  const jobs = await cronJobs(sql)
  const pgCron = plan.extensions.some((extension) => extension.name === 'pg_cron')
  const cron = jobs && cronPlan(jobs, { pgCron, target: plan, timezone: await cronTimezone(sql), isSchedule })
  const rescheduled = (cron ?? []).filter((job) => job.outcome.kind === 'rescheduled')
  const manifest = {
    schemas,
    tables,
    bytes: await tablesSize(sql, tables),
    cronJobs: cron,
    vaultSecrets: await vaultSecrets(sql),
    vaultReplayed: secrets !== undefined,
    pgsodiumColumns: await pgsodiumColumns(sql, schemas),
    queues: queues?.map((queue) => ({ name: queue.name, partitioned: queue.partitioned, messages: queue.messages.length })),
    queuesReplayed: plan.queues && queues !== undefined,
    realtimeTables: await realtimeTables(sql),
    extensionsLeftOut: plan.leftOut,
    httpTriggers: triggers,
    httpSent: plan.httpSent,
    hypertables: await hypertables(sql, schemas),
    routinesLeftOut: await routinesIn(sql, schemas, plan.missing.languages),
  } satisfies Partial<ImportManifest>
  return { manifest, plan, realtimePolicies: await realtimePolicies((text, params) => sql.unsafe(text, params as never[])), replay: replayScript({ secrets: secrets ?? [], queues: replayed, cronJobs: rescheduled }) }
}

/**
 * Fails unless the target can take the schema migration: makes the API roles it lacks, and finds no schema or table in
 * the way, such as the auth schema of Protobase's own user table, made by the project's auth migrations.
 */
const checkTarget = async (url: string, schemas: string[], tables: ImportManifest['tables']) => {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const schemasThere = await existingSchemas(sql, schemas.filter((schema) => schema !== 'public'))
    if (schemasThere.length > 0) throw new Error(`The project's database already has the schemas ${schemasThere.join(', ')}, which the import creates; import into a database without them, such as a new one`)
    const created = await ensureApiRoles(sql)
    const existing = await existingTables(sql, tables)
    if (existing.length > 0) throw new Error(`The project's database already has ${existing.length} of the tables to import, such as ${existing.slice(0, 5).join(', ')}; import into a database without them`)
    return created
  } finally {
    await sql.end()
  }
}

/** A name as a pg_dump pattern matches it exactly, whatever its case or characters. */
const pattern = (name: string) => `"${name.replaceAll('"', '""')}"`

/**
 * The import's first run: dumps the Supabase database's schemas and data as of one snapshot, writes the schema as
 * the project's next migration, with the extensions the project's database can create, and the columns Better Auth
 * needs on auth.users as the one after, then the realtime schema: `realtime.send()` and `realtime.broadcast_changes()`,
 * which broadcast from the database, and `realtime.messages` with its policies, which authorize private Realtime
 * channels, points the app's Better Auth setup at auth.users in place of the user table the
 * project's auth migrations make, removing them, and keeps the data dump, the replay of Vault's secrets, pgmq's
 * queues and pg_cron's jobs and what the report needs in `supabase-import/` for the run that loads it, once the
 * project's migrations are applied.
 */
export const runDumpPhase = async (options: DumpOptions, out: (text: string) => void) => {
  const authConfig = await planAuthConfig(options.projectDir, importedUsersConfig)
  const storeMigrations = await authStoreMigrations(options.migrationsDir)
  const checkout = checkoutMarkers(options.projectDir)
  if (checkout.length > 0) out(`found the Supabase project's ${checkout.join(', ')}\n`)
  // Before the dump, so a function in the way stops the import before it starts.
  const functions = await planFunctions(options.projectDir)
  const state = importState(options.projectDir)
  const sql = connect(options.sourceUrl)
  const reserved = await sql.reserve()
  try {
    await checkSupabase(reserved)
    await reserved`begin isolation level repeatable read read only`
    const [exported] = await reserved<{ snapshot: string }[]>`select pg_export_snapshot() as snapshot`
    const snapshot = exported!.snapshot
    refuseSsoUsers(await countSsoUsers((text) => reserved.unsafe(text)))
    const { manifest: source, plan, realtimePolicies: policies, replay } = await readSource(reserved, options.targetUrl)
    // The realtime schema always comes over, for the triggers and SQL that broadcast from the database.
    const created = await checkTarget(options.targetUrl, [...source.schemas, 'realtime'], source.tables)
    if (created.length > 0) out(`created the roles ${created.join(', ')} in the project's database\n`)

    await state.prepare()
    const schemaFile = path.join(state.dir, 'schema.sql')
    const tableArgs = [...source.schemas.map((schema) => `--schema=${pattern(schema)}`), ...platformMigrationTables.map((table) => `--exclude-table=${table.split('.').map(pattern).join('.')}`)]
    await runPgTool('pg_dump', options.sourceUrl, ['--schema-only', '--no-owner', `--snapshot=${snapshot}`, ...tableArgs, `--file=${schemaFile}`])
    await runPgTool('pg_dump', options.sourceUrl, ['--data-only', `--snapshot=${snapshot}`, ...tableArgs, `--file=${state.data}`])
    await reserved`commit`
    if (replay) await state.writeReplay(replay)

    const migration = schemaMigration(await readFile(schemaFile, 'utf8'), { schemas: source.schemas, extensions: plan.extensions, webhooks: plan.webhooks, missing: plan.missing, encryptedColumns: source.pgsodiumColumns })
    await rm(schemaFile)
    await mkdir(options.migrationsDir, { recursive: true })
    const file = await writeMigration(options.migrationsDir, 'supabase_schema', migration.text)
    const usersFile = await writeMigration(options.migrationsDir, 'supabase_users', usersColumnsMigration())
    const realtimeFile = await writeMigration(options.migrationsDir, 'supabase_realtime', realtimeMigration(policies))
    await authConfig.write()
    for (const store of storeMigrations) await rm(path.join(options.migrationsDir, store))
    const packages = await writeFunctions(options.projectDir, functions)
    await state.writeManifest({ migration: file, leftOut: migration.leftOut, checkout, functions: { converted: functions.functions, packages, left: functions.left }, ...source })
    const relative = (to: string) => path.relative(options.projectDir, to)
    out(`wrote ${relative(path.join(options.migrationsDir, file))}, the schemas ${source.schemas.join(', ')}\n`)
    out(`wrote ${relative(path.join(options.migrationsDir, usersFile))}, the columns Better Auth needs on auth.users, and pointed ${relative(authConfig.file)} at it\n`)
    out(`wrote ${relative(path.join(options.migrationsDir, realtimeFile))}, realtime.send() and realtime.broadcast_changes(), which broadcast from the database, and realtime.messages with its ${policies.length} policies, which authorize private Realtime channels\n`)
    for (const store of storeMigrations) out(`removed ${relative(path.join(options.migrationsDir, store))}: auth.users replaces Protobase's own user table it made\n`)
    if (functions.functions.length > 0) out(`converted ${functions.functions.length} Edge Functions into functions/${packages.length > 0 ? `, adding ${packages.length} packages to package.json: install them` : ''}\n`)
    out(`dumped ${source.tables.length} tables' data into ${path.relative(options.projectDir, state.data)}, which git ignores\n`)
    if (replay) out(`kept Vault's secrets, pgmq's queues and pg_cron's jobs to make again in ${path.relative(options.projectDir, state.replay)}, which git ignores\n`)
    out("next: apply the migration with the project's migrations, then run `protobase import supabase` again to load the data\n")
  } finally {
    reserved.release()
    await sql.end()
  }
}
