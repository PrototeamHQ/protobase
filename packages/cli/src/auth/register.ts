import path from 'node:path'
import type { Command } from 'commander'
import { loadProjectAuth } from '../users/load-auth'
import { writeAuthMigration } from './write-migration'

const out = (text: string) => process.stdout.write(text)

export const registerAuth = (program: Command) => {
  const auth = program.command('auth').description('The auth schema of the project in the current directory')

  auth
    .command('migration')
    .description("Write the auth schema changes this Protobase version needs as the project's next SQL migration, compared with its database")
    .option('--dir <dir>', 'migrations folder', 'db/migrations')
    .option('--name <name>', 'file name after the number', 'auth')
    .action(async (opts) => {
      const file = await writeAuthMigration({ auth: await loadProjectAuth(process.cwd()), dir: path.resolve(opts.dir), name: opts.name })
      out(file ? `wrote ${path.relative(process.cwd(), file)}; apply it with the project's migrations\n` : 'the auth schema is up to date; nothing to write\n')
      // The auth store keeps a connection pool open.
      process.exit(0)
    })
}
