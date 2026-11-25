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
    .option('--force', 'turn a sign-in module on again even while the tables it kept off hold rows, which come back into use')
    .action(async (connection: string | undefined, opts) => {
      loadNearestEnvFile(process.cwd())
      const { migrateProject } = await import('./migrate-project')
      await migrateProject(process.cwd(), () => resolveConnectionUrl(connection, opts.env), out, { plan: Boolean(opts.plan), force: Boolean(opts.force) })
    })

  const migration = folderOptions(
    program
      .command('migration')
      .description("Write what the config and this version of Protobase need beyond protobase.snapshot.json as the project's next numbered SQL migration, and rewrite the snapshot")
      .option('--custom <name>', 'write an empty numbered migration to fill by hand, and make the snapshot end at it')
      .option('--record-config', "with --custom: record the config's auth store names in the snapshot, which the file makes the store match")
      .option('--after', 'with --custom: write an empty .after.sql beside it too, for statements that cannot run in a transaction, such as create index concurrently')
      .option('--off <choice>', 'what becomes of the tables of a sign-in module the config turns off, without asking: keep, archive or delete')
      .option('--force', 'write the migration that turns a kept sign-in module on again even while its tables hold rows'),
  ).action(async (opts: FolderOptions & { custom?: string; recordConfig?: boolean; after?: boolean; off?: string; force?: boolean }) => {
    if (opts.recordConfig && !opts.custom) throw new Error('--record-config goes with --custom <name>')
    if (opts.after && !opts.custom) throw new Error('--after goes with --custom <name>')
    const { config, auth } = await loadAuthTarget(opts)
    const dir = path.resolve(opts.dir)
    if (opts.custom) {
      const { writeCustomMigration } = await import('./snapshot/custom')
      const file = await writeCustomMigration({ projectDir: process.cwd(), dir, name: opts.custom, recordConfig: Boolean(opts.recordConfig), after: Boolean(opts.after), auth, protobaseVersion, newId: randomUUID })
      out(`wrote ${path.relative(process.cwd(), file)}${opts.after ? ', its .after.sql' : ''} and protobase.snapshot.json: write its statements\n`)
      return
    }
    const [{ migrationProject }, { configModules }, { schemaModules }, { migrationParts }, { runMigration }, { migrationSummary }, { offChoice }, { trialContractions }, prompts] = await Promise.all([
      import('./migration-project'),
      import('../config/project-modules'),
      import('@protobase/server/internal'),
      import('./parts'),
      import('./snapshot/run-migration'),
      import('./summary'),
      import('./snapshot/off-choice'),
      import('./older-code/trial'),
      import('./snapshot/terminal-prompts'),
    ])
    const off = offChoice(opts.off)
    const url = process.env.DATABASE_URL
    const project = url ? await migrationProject(config, url) : undefined
    try {
      const asks = process.stdin.isTTY ? prompts.terminalPrompts() : undefined
      const database = project && url ? { url, parts: migrationParts(project), contractions: (sections: Parameters<typeof trialContractions>[1], dropped: readonly string[]) => trialContractions(url, sections, dropped), readModule: (id: keyof typeof schemaModules, input: Parameters<(typeof schemaModules)[typeof id]['read']>[1]) => schemaModules[id].read(project.db, input) } : undefined
      const modules = project ? project.modules : await configModules(config)
      const file = await runMigration({ projectDir: process.cwd(), dir, auth, modules, database, protobaseVersion, newId: randomUUID, ...(off && { off }), force: Boolean(opts.force), ...asks?.prompts }).finally(() => asks?.close())
      out(migrationSummary(file, process.cwd(), { hasAuth: Boolean(auth), compared: Boolean(project) }))
    } finally {
      await project?.close()
    }
    // The auth store keeps a connection pool open.
    process.exit(0)
  })

  folderOptions(migration.command('check').description('Report, writing nothing, what keeps the migrations and protobase.snapshot.json from matching the config, and warn of statements that lock reads or take from older code unmarked; exit code 1 when anything but a warning is found, for CI')).action(async (opts: FolderOptions) => {
    const { config, auth } = await loadAuthTarget(opts)
    const [{ checkMigrations }, { fileWarnings }, { readMigrationFiles }, { configModules }] = await Promise.all([import('./snapshot/check'), import('./older-code/lint-files'), import('./snapshot/migration-files'), import('../config/project-modules')])
    const dir = path.resolve(opts.dir)
    const found = await checkMigrations(process.cwd(), dir, auth, await configModules(config))
    out(fileWarnings(await readMigrationFiles(dir)).map((line) => `warning: ${line}\n`).join(''))
    if (found.length === 0) {
      out('the migrations and protobase.snapshot.json match the config\n')
      return
    }
    out(found.map((line) => `${line}\n`).join(''))
    process.exitCode = 1
  })

  folderOptions(
    migration
      .command('baseline')
      .description("Describe in protobase.snapshot.json, from DATABASE_URL read once, the auth store of a project whose auth migrations came before it, and the schema modules it does not record yet, with a numbered migration that changes nothing"),
  ).action(async (opts: FolderOptions) => {
    const { config, auth } = await loadAuthTarget(opts)
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("No database: set DATABASE_URL to the project's database with its migrations applied")
    const [{ writeBaseline }, { configModules }] = await Promise.all([import('./baseline/write-baseline'), import('../config/project-modules')])
    const file = await writeBaseline({ projectDir: process.cwd(), dir: path.resolve(opts.dir), auth, modules: await configModules(config), url, protobaseVersion, newId: randomUUID })
    out(`wrote ${path.relative(process.cwd(), file)} and protobase.snapshot.json: apply it with the project's migrations, then run \`protobase migration\`\n`)
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
    .command('contract')
    .description('Sign off the update that turned a sign-in module off with --off archive or delete: write the next migration, which archives what it retired once that update served long enough')
    .option('--dir <dir>', 'migrations folder', 'db/migrations')
    .option('--hours <hours>', 'the hours the file that turned it off must have been applied for, before the migration applies', '24')
    .action(async (opts: { dir: string; hours: string }) => {
      const [{ writeContract }, { signOffHours }] = await Promise.all([import('./sign-off/contract'), import('./sign-off/signed-off-file')])
      const file = await writeContract({ projectDir: process.cwd(), dir: path.resolve(opts.dir), hours: signOffHours(opts.hours), protobaseVersion, newId: randomUUID })
      out(`wrote ${path.relative(process.cwd(), file)} and protobase.snapshot.json: apply it with the project's migrations once the update has served for ${opts.hours} hours\n`)
    })

  migration
    .command('delete')
    .description('Write the next migration, which drops for good what `contract` archived of a sign-in module, once nothing wrote it for a period')
    .argument('<module>', 'the archived module, such as organizations')
    .option('--dir <dir>', 'migrations folder', 'db/migrations')
    .option('--hours <hours>', 'the hours since the archive was applied, through which retired.writes must count no write of it', '168')
    .action(async (module: string, opts: { dir: string; hours: string }) => {
      const [{ writeDelete }, { signOffHours }] = await Promise.all([import('./sign-off/delete'), import('./sign-off/signed-off-file')])
      const file = await writeDelete({ projectDir: process.cwd(), dir: path.resolve(opts.dir), module, hours: signOffHours(opts.hours), protobaseVersion, newId: randomUUID })
      out(`wrote ${path.relative(process.cwd(), file)} and protobase.snapshot.json: apply it with the project's migrations\n`)
    })

  migration
    .command('up')
    .description("Rewrite protobase.snapshot.json in this version's format")
    .action(async () => {
      const { upgradeSnapshot } = await import('./snapshot/up')
      out(`${await upgradeSnapshot(process.cwd())}\n`)
    })
}
