// `bun run db:down`: stops the development databases the way POSTGRES_RUNNER in `.env` says (./runner.ts), keeping their data.
import { run } from './local/executables'
import { stopPgbouncer } from './local/pgbouncer'
import { stopPostgres } from './local/postgres'
import { readSettings } from './local/settings'
import { parseRunner } from './runner'

const runner = parseRunner(process.env.POSTGRES_RUNNER)

if (runner === 'docker') run('docker', ['compose', 'down'])
if (runner === 'local') {
  await stopPgbouncer()
  stopPostgres(readSettings(process.env))
}
