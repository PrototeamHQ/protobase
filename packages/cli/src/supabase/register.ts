import path from 'node:path'
import type { Command } from 'commander'
import { loadNearestEnvFile } from '../dev/env'
import { projectUrl } from './storage-url'

const out = (text: string) => process.stdout.write(text)

const variable = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Environment variable ${name} is not set`)
  return value
}

export const registerImport = (program: Command) => {
  const imports = program.command('import').description('Turn another platform\'s project into this Protobase project')

  imports
    .command('supabase')
    .description(
      "Import a Supabase database into the project in the current directory. The first run dumps it and writes its schemas as the project's next migration; once the project's migrations are applied, the second run loads the data, scaffolds the config, writes the migrations that sign its users in with Better Auth and writes supabase-import/report.md. With --storage-url, the second run, or any later one, copies Storage's files into the app's file provider",
    )
    .argument('[source]', "the Supabase database's connection string, for the first run")
    .option('--source-env <variable>', 'read the Supabase connection string from this environment variable')
    .option('--env <variable>', "environment variable holding the project's database URL", 'DATABASE_URL')
    .option('--dir <dir>', 'migrations folder', 'db/migrations')
    .option('--config <dir>', 'config folder', 'config')
    .option('--storage-url <url>', "the Supabase project's URL, such as https://<ref>.supabase.co, to copy Storage's files from")
    .option('--storage-key-env <variable>', "environment variable holding the Supabase project's secret key, for --storage-url", 'SUPABASE_SERVICE_ROLE_KEY')
    .option('--yes', "copy Storage's files even when they exceed the file provider's max_bytes", false)
    .action(async (source: string | undefined, opts) => {
      const storageUrl = opts.storageUrl ? projectUrl(opts.storageUrl) : undefined
      if (source && opts.sourceEnv) throw new Error('Pass either a connection string or --source-env, not both')
      const projectDir = process.cwd()
      loadNearestEnvFile(projectDir)
      const { runSupabaseImport } = await import('./run')
      await runSupabaseImport(
        {
          sourceUrl: source ?? (opts.sourceEnv ? variable(opts.sourceEnv) : undefined),
          targetUrl: variable(opts.env),
          projectDir,
          migrationsDir: path.resolve(opts.dir),
          configDir: path.resolve(opts.config),
          storage: storageUrl ? { url: storageUrl, key: variable(opts.storageKeyEnv) } : undefined,
          yes: opts.yes,
        },
        out,
      )
      // The load's run opened the project's auth, which keeps a connection pool open.
      process.exit(0)
    })
}
