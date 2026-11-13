import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { capture, findExecutable, run } from './executables'
import { folder, type Settings } from './settings'

const dataFolder = path.join(folder, 'data')
const logFile = path.join(folder, 'postgres.log')

/**
 * The server's settings: docker-compose.yml's bulk-load friendly ones and the container's UTC time zone, on 127.0.0.1
 * only, as the container publishes, and without a Unix socket, so it never clashes with another server's in /tmp.
 */
export const serverOptions = (port: number) =>
  [
    'listen_addresses=127.0.0.1',
    `port=${port}`,
    "unix_socket_directories=''",
    'shared_buffers=512MB',
    'maintenance_work_mem=512MB',
    'max_wal_size=8GB',
    'checkpoint_timeout=15min',
    'timezone=Etc/UTC',
    'log_timezone=Etc/UTC',
  ]
    .map((setting) => `-c ${setting}`)
    .join(' ')

const executable = (name: string, settings: Settings) => {
  const file = findExecutable(name, settings.bin)
  if (!file) throw new Error(`No ${name} ${settings.bin ? `in POSTGRES_BIN (${settings.bin})` : 'on PATH'}: install Postgres 18 or set POSTGRES_BIN to its bin folder`)
  return file
}

const isRunning = (pgCtl: string) => capture(pgCtl, ['status', '-D', dataFolder]).status === 0

/** The postgres image's locale, which the server's sort order follows; initdb needs the operating system to have it. */
const locale = 'en_US.UTF-8'

/** Whether `locale -a` lists the locale, in either of its spellings (`en_US.UTF-8` on macOS, `en_US.utf8` on glibc). */
export const hasLocale = (installed: string, name = locale) => {
  const normalise = (value: string) => value.trim().toLowerCase().replace('utf-8', 'utf8')
  return installed.split('\n').some((line) => normalise(line) === normalise(name))
}

/** Creates the data folder as the postgres image does: the superuser with its password, UTF-8, scram-sha-256 over TCP. */
const initialise = (settings: Settings) => {
  if (!hasLocale(capture('locale', ['-a']).stdout)) throw new Error(`The locale ${locale}, which the postgres image uses, is not installed: install it, then run db:up again`)
  mkdirSync(folder, { recursive: true })
  const passwordFile = path.join(folder, 'password')
  writeFileSync(passwordFile, settings.password, { mode: 0o600 })
  try {
    const args = ['-D', dataFolder, '-U', settings.user, `--pwfile=${passwordFile}`, '-E', 'UTF8', `--locale=${locale}`, '--auth-local=trust', '--auth-host=scram-sha-256']
    run(executable('initdb', settings), args)
  } finally {
    rmSync(passwordFile)
  }
}

/** A data folder from another major version cannot be started; say so instead of leaving it to the server's log. */
const checkVersion = (settings: Settings) => {
  const dataVersion = readFileSync(path.join(dataFolder, 'PG_VERSION'), 'utf8').trim()
  const output = capture(executable('postgres', settings), ['--version']).stdout
  const serverVersion = output.match(/(\d+)\.\d+/)?.[1]
  if (serverVersion === dataVersion) return
  throw new Error(`${dataFolder} holds Postgres ${dataVersion} data, but the server is ${output.trim()}: point POSTGRES_BIN at Postgres ${dataVersion} or remove ${folder}`)
}

/** A name as one SQL identifier, dots included, with each double quote inside doubled. */
export const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`

/** Creates POSTGRES_DB, which the postgres image creates on its first start. */
const createDatabase = async (settings: Settings) => {
  const sql = postgres({ host: '127.0.0.1', port: settings.port, user: settings.user, password: settings.password, database: 'postgres', max: 1, onnotice: () => {} })
  const [existing] = await sql`select 1 from pg_database where datname = ${settings.database}`
  if (!existing) await sql.unsafe(`create database ${quoteIdentifier(settings.database)}`)
  await sql.end()
}

/** Starts the local server, first creating its data folder when there is none. */
export const startPostgres = async (settings: Settings) => {
  const pgCtl = executable('pg_ctl', settings)
  if (!existsSync(path.join(dataFolder, 'PG_VERSION'))) initialise(settings)
  checkVersion(settings)
  if (!isRunning(pgCtl)) run(pgCtl, ['start', '-D', dataFolder, '-l', logFile, '-w', '-o', serverOptions(settings.port)])
  await createDatabase(settings)
}

/** Stops the local server when it runs, keeping its data folder, as `docker compose down` keeps the volume. */
export const stopPostgres = (settings: Settings) => {
  const pgCtl = executable('pg_ctl', settings)
  if (!existsSync(path.join(dataFolder, 'PG_VERSION')) || !isRunning(pgCtl)) return
  run(pgCtl, ['stop', '-D', dataFolder, '-m', 'fast'])
}
