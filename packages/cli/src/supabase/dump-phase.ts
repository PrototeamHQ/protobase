import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'
import { nextMigrationName } from '../auth/migration-file'
import { connect, type Sql } from '../db/connect'
import { checkoutMarkers, edgeFunctions } from './checkout'
import { appExtensions } from './extensions'
import { importState, type ImportManifest } from './import-state'
import { runPgTool } from './pg-tools'
import { schemaMigration } from './schema-migration'
import { appSchemas, cronJobs, databaseMarkers, dumpedTables, extensions, httpTriggers, platformMigrationTables, realtimeTables, tablesSize, vaultSecrets } from './source-facts'
import { ensureApiRoles, existingTables } from './target-checks'

export type DumpOptions = { sourceUrl: string; targetUrl: string; projectDir: string; migrationsDir: string }

/** Fails unless the database at `sql` is Supabase's: its auth and storage schemas, and its own admin role. */
const checkSupabase = async (sql: Sql) => {
  const markers = await databaseMarkers(sql)
  const missing = [...['auth', 'storage'].filter((schema) => !markers.schemas.includes(schema)).map((schema) => `schema ${schema}`), ...(markers.roles.includes('supabase_admin') ? [] : ['role supabase_admin'])]
  if (missing.length > 0) throw new Error(`The source database is not a Supabase database: it lacks the ${missing.join(' and ')}`)
  return markers
}

/** What the source holds, read in the transaction whose snapshot the dumps take, so all of it is of one moment. */
const readSource = async (sql: Sql) => {
  const schemas = await appSchemas(sql)
  const tables = await dumpedTables(sql, schemas)
  const sourceExtensions = appExtensions(await extensions(sql))
  return {
    schemas,
    tables,
    bytes: await tablesSize(sql, tables),
    trusted: sourceExtensions.trusted,
    untrustedExtensions: sourceExtensions.untrusted,
    cronJobs: await cronJobs(sql),
    vaultSecrets: await vaultSecrets(sql),
    realtimeTables: await realtimeTables(sql),
    httpTriggers: await httpTriggers(sql, schemas),
  }
}

/** Fails unless the target can take the schema migration: makes the API roles it lacks, and finds no table in the way. */
const checkTarget = async (url: string, tables: ImportManifest['tables']) => {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
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
 * the project's next migration, and keeps the data dump and what the report needs in `supabase-import/` for the run
 * that loads it, once the project's migrations are applied.
 */
export const runDumpPhase = async (options: DumpOptions, out: (text: string) => void) => {
  const checkout = checkoutMarkers(options.projectDir)
  if (checkout.length > 0) out(`found the Supabase project's ${checkout.join(', ')}\n`)
  const state = importState(options.projectDir)
  const sql = connect(options.sourceUrl)
  const reserved = await sql.reserve()
  try {
    await checkSupabase(reserved)
    await reserved`begin isolation level repeatable read read only`
    const [exported] = await reserved<{ snapshot: string }[]>`select pg_export_snapshot() as snapshot`
    const snapshot = exported!.snapshot
    const source = await readSource(reserved)
    const created = await checkTarget(options.targetUrl, source.tables)
    if (created.length > 0) out(`created the roles ${created.join(', ')} in the project's database\n`)

    await state.prepare()
    const schemaFile = path.join(state.dir, 'schema.sql')
    const tableArgs = [...source.schemas.map((schema) => `--schema=${pattern(schema)}`), ...platformMigrationTables.map((table) => `--exclude-table=${table.split('.').map(pattern).join('.')}`)]
    await runPgTool('pg_dump', options.sourceUrl, ['--schema-only', '--no-owner', `--snapshot=${snapshot}`, ...tableArgs, `--file=${schemaFile}`])
    await runPgTool('pg_dump', options.sourceUrl, ['--data-only', `--snapshot=${snapshot}`, ...tableArgs, `--file=${state.data}`])
    await reserved`commit`

    const migration = schemaMigration(await readFile(schemaFile, 'utf8'), { schemas: source.schemas, extensions: source.trusted })
    await rm(schemaFile)
    await mkdir(options.migrationsDir, { recursive: true })
    const file = nextMigrationName(await readdir(options.migrationsDir), 'supabase_schema')
    await writeFile(path.join(options.migrationsDir, file), migration.text, { flag: 'wx' })
    const { trusted, ...facts } = source
    await state.writeManifest({ migration: file, leftOut: migration.leftOut, checkout, functions: await edgeFunctions(options.projectDir), ...facts })
    out(`wrote ${path.relative(options.projectDir, path.join(options.migrationsDir, file))}, the schemas ${source.schemas.join(', ')}\n`)
    out(`dumped ${source.tables.length} tables' data into ${path.relative(options.projectDir, state.data)}, which git ignores\n`)
    out("next: apply the migration with the project's migrations, then run `protobase import supabase` again to load the data\n")
  } finally {
    reserved.release()
    await sql.end()
  }
}
