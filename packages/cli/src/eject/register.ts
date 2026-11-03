import path from 'node:path'
import type { Command } from 'commander'
import { isConnectionString, resolveConnectionUrl } from '../db/connection-url'
import { loadNearestEnvFile } from '../dev/env'

const out = (text: string) => process.stdout.write(text)

export const registerEject = (program: Command) => {
  program
    .command('eject')
    .description('Take tables users added over as code: write config/<table>/data.ts and ui.ts, and a migration that makes each table as it is')
    .argument('<args...>', 'connection string (default: DATABASE_URL from the environment or .env) followed by the names of the tables')
    .option('--env <variable>', 'read the connection string from this environment variable')
    .option('--config <dir>', 'config folder', 'config')
    .option('--dir <dir>', 'migrations folder', 'db/migrations')
    .action(async (args: string[], opts) => {
      loadNearestEnvFile(process.cwd())
      const [first, ...rest] = args
      const fromArgument = !opts.env && first !== undefined && isConnectionString(first)
      const url = resolveConnectionUrl(fromArgument ? first : undefined, opts.env)
      const { runEject } = await import('./run')
      await runEject(
        { url, names: fromArgument ? rest : args, configDir: path.resolve(opts.config), migrationsDir: path.resolve(opts.dir), projectDir: process.cwd() },
        out,
      )
    })
}
