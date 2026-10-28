import path from 'node:path'
import type { Command } from 'commander'
import { resolveConnectionUrl } from '../db/connection-url'
import { loadNearestEnvFile } from '../dev/env'

const out = (text: string) => process.stdout.write(text)

const collect = (value: string, previous: string[]) => [...previous, value]

export const registerMigration = (program: Command) => {
  program
    .command('migrate')
    .description("Apply the project's db/migrations/*.sql not applied yet, in one transaction, as the runtime's migrate applies a bundle's")
    .argument('[connection]', 'connection string (default: DATABASE_URL from the environment or .env)')
    .option('--env <variable>', 'read the connection string from this environment variable')
    .action(async (connection: string | undefined, opts) => {
      loadNearestEnvFile(process.cwd())
      const { migrateProject } = await import('./migrate-project')
      await migrateProject(process.cwd(), () => resolveConnectionUrl(connection, opts.env), out)
    })

  program
    .command('migration')
    .description("Write what the database still needs for every feature the config enables (auth, events, jobs) as the project's next SQL migrations")
    .option('--dir <dir>', 'migrations folder', 'db/migrations')
    .option('--extend <dir>', 'merge the protobase.config.ts in this folder before the project\'s, as dev and build do, repeatable', collect, [])
    .action(async (opts) => {
      const [{ loadMigrationProject }, { migrationParts }, { writeMigrations }, { migrationSummary }, { resolveExtensions }] = await Promise.all([
        import('./load-project'),
        import('./parts'),
        import('./write-migrations'),
        import('./summary'),
        import('../project/extensions'),
      ])
      const project = await loadMigrationProject(process.cwd(), resolveExtensions(opts.extend))
      try {
        const files = await writeMigrations(migrationParts(project), path.resolve(opts.dir))
        out(migrationSummary(files, process.cwd(), Boolean(project.auth)))
      } finally {
        await project.close()
      }
      // The auth store keeps a connection pool open.
      process.exit(0)
    })
}
