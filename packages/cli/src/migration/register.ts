import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Command } from 'commander'
import { resolveConnectionUrl } from '../db/connection-url'
import { loadNearestEnvFile } from '../dev/env'
import { protobaseVersion } from '../version/version'

const out = (text: string) => process.stdout.write(text)

const collect = (value: string, previous: string[]) => [...previous, value]

// The folder options every `migration` command takes, and the config's auth store they compare.
type FolderOptions = { dir: string; extend: string[] }

const loadAuthTarget = async (opts: FolderOptions) => {
  const [{ loadMigrationConfig }, { authTarget }, { resolveExtensions }] = await Promise.all([import('./load-project'), import('./snapshot/auth-target'), import('../project/extensions')])
  const config = await loadMigrationConfig(process.cwd(), resolveExtensions(opts.extend))
  return { config, auth: await authTarget(config) }
}

const folderOptions = (command: Command) =>
  command
    .option('--dir <dir>', 'migrations folder', 'db/migrations')
    .option('--extend <dir>', "merge the protobase.config.ts in this folder before the project's, as dev and build do, repeatable", collect, [])

export const registerMigration = (program: Command) => {
  program
    .command('migrate')
    .description("Apply the project's db/migrations/*.sql not applied yet, in one transaction, as the runtime's migrate applies a bundle's")
    .argument('[connection]', 'connection string (default: DATABASE_URL from the environment or .env)')
    .option('--env <variable>', 'read the connection string from this environment variable')
    .option('--plan', "print each migration not applied yet with its SQL, and apply nothing")
    .action(async (connection: string | undefined, opts) => {
      loadNearestEnvFile(process.cwd())
      const { migrateProject } = await import('./migrate-project')
      await migrateProject(process.cwd(), () => resolveConnectionUrl(connection, opts.env), out, Boolean(opts.plan))
    })

  const migration = folderOptions(
    program
      .command('migration')
      .description("Write what the config and this version of Protobase need beyond protobase.snapshot.json as the project's next numbered SQL migration, and rewrite the snapshot")
      .option('--custom <name>', 'write an empty numbered migration to fill by hand, and make the snapshot end at it')
      .option('--record-config', "with --custom: record the config's auth store names in the snapshot, which the file makes the store match"),
  ).action(async (opts: FolderOptions & { custom?: string; recordConfig?: boolean }) => {
    if (opts.recordConfig && !opts.custom) throw new Error('--record-config goes with --custom <name>')
    const { config, auth } = await loadAuthTarget(opts)
    const dir = path.resolve(opts.dir)
    if (opts.custom) {
      const { writeCustomMigration } = await import('./snapshot/custom')
      const file = await writeCustomMigration({ projectDir: process.cwd(), dir, name: opts.custom, recordConfig: Boolean(opts.recordConfig), auth, protobaseVersion, newId: randomUUID })
      out(`wrote ${path.relative(process.cwd(), file)} and protobase.snapshot.json: write its statements\n`)
      return
    }
    const [{ migrationProject }, { migrationParts }, { runMigration }, { migrationSummary }] = await Promise.all([import('./load-project'), import('./parts'), import('./snapshot/run-migration'), import('./summary')])
    const url = process.env.DATABASE_URL
    const project = url ? await migrationProject(config, url) : undefined
    try {
      const file = await runMigration({ projectDir: process.cwd(), dir, auth, database: project && url ? { url, parts: migrationParts(project) } : undefined, protobaseVersion, newId: randomUUID })
      out(migrationSummary(file, process.cwd(), { hasAuth: Boolean(auth), compared: Boolean(project) }))
    } finally {
      await project?.close()
    }
    // The auth store keeps a connection pool open.
    process.exit(0)
  })

  folderOptions(migration.command('check').description('Report, writing nothing, what keeps the migrations and protobase.snapshot.json from matching the config; exit code 1 when anything does, for CI')).action(async (opts: FolderOptions) => {
    const { auth } = await loadAuthTarget(opts)
    const { checkMigrations } = await import('./snapshot/check')
    const found = await checkMigrations(process.cwd(), path.resolve(opts.dir), auth)
    if (found.length === 0) {
      out('the migrations and protobase.snapshot.json match the config\n')
      return
    }
    out(found.map((line) => `${line}\n`).join(''))
    process.exitCode = 1
  })

  migration
    .command('drop')
    .description('Delete the newest migration `protobase migration` wrote and take protobase.snapshot.json back to the one before it')
    .option('--dir <dir>', 'migrations folder', 'db/migrations')
    .action(async (opts: { dir: string }) => {
      const { dropMigration } = await import('./snapshot/drop')
      out(`deleted ${await dropMigration(process.cwd(), path.resolve(opts.dir))} and took protobase.snapshot.json back\n`)
    })

  migration
    .command('up')
    .description("Rewrite protobase.snapshot.json in this version's format")
    .action(async () => {
      const { upgradeSnapshot } = await import('./snapshot/up')
      out(`${await upgradeSnapshot(process.cwd())}\n`)
    })
}
