import path from 'node:path'
import type { Command } from 'commander'
import { resolveExtensions } from '../project/extensions'
import { loadMigrationProject } from './load-project'
import { migrationParts } from './parts'
import { writeMigrations } from './write-migrations'

const out = (text: string) => process.stdout.write(text)

const collect = (value: string, previous: string[]) => [...previous, value]

export const registerMigration = (program: Command) => {
  program
    .command('migration')
    .description("Write what the database still needs for every feature the config enables (auth, events, jobs) as the project's next SQL migrations")
    .option('--dir <dir>', 'migrations folder', 'db/migrations')
    .option('--extend <dir>', 'merge the protobase.config.ts in this folder before the project\'s, as dev and build do, repeatable', collect, [])
    .action(async (opts) => {
      const project = await loadMigrationProject(process.cwd(), resolveExtensions(opts.extend))
      try {
        const files = await writeMigrations(migrationParts(project), path.resolve(opts.dir))
        out(files.length > 0 ? files.map((file) => `wrote ${path.relative(process.cwd(), file)}\n`).join('') + "apply them with the project's migrations\n" : 'the database is up to date; nothing to write\n')
      } finally {
        await project.close()
      }
      // The auth store keeps a connection pool open.
      process.exit(0)
    })
}
