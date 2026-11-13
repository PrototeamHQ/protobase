// `bun run db:up`: starts the development databases the way POSTGRES_RUNNER in `.env` says (./runner.ts).
import { run } from './local/executables'
import { startPgbouncer } from './local/pgbouncer'
import { startPostgres } from './local/postgres'
import { readSettings } from './local/settings'
import { parseRunner } from './runner'

const runner = parseRunner(process.env.POSTGRES_RUNNER)

if (runner === 'docker') run('docker', ['compose', 'up', '-d', '--wait'])
if (runner === 'local') {
  const settings = readSettings(process.env)
  await startPostgres(settings)
  startPgbouncer(settings)
}
