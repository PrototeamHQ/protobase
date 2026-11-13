// The app's own Postgres: the Windows binaries of the npm package @embedded-postgres/windows-x64 (the PostgreSQL 18.6
// distribution), downloaded once, checked against their npm integrity and unpacked with Windows' tar; a data folder
// made by initdb in UTF-8; started and stopped with pg_ctl, which drops the administrator rights postgres.exe refuses.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const version = '18.6.0-beta.19'
const tarball = `https://registry.npmjs.org/@embedded-postgres/windows-x64/-/windows-x64-${version}.tgz`
const integrity = 'sha512-fp8d8f+6WfJQftX0D+l1vUTLPwCN5hlhV/g/KI5zDBwHURmta6ph3/kJeEOVirtbczO/pKQlqM4cELB2c7Sp7Q=='
const windowsTar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')

export type Postgres = { bin: string; data: string; log: string; user: string; password: string; port: number }

export const postgresIn = (home: string, password: string, port: number): Postgres => ({
  bin: path.join(home, `postgres-${version}`, 'bin'),
  data: path.join(home, 'data', 'postgres'),
  log: path.join(home, 'data', 'postgres.log'),
  user: 'protobase',
  password,
  port,
})

export const databaseUrl = (pg: Postgres) => `postgres://${pg.user}:${encodeURIComponent(pg.password)}@127.0.0.1:${pg.port}/postgres`

/** Whether `bytes` are the tarball npm lists, by its sha512 integrity. */
export const matchesIntegrity = (bytes: Uint8Array, expected: string) => `sha512-${createHash('sha512').update(bytes).digest('base64')}` === expected

// pg_ctl start hands its stdout and stderr to the server it starts, so a pipe would never close: its output goes to a file.
const run = (pg: Postgres, program: string, args: string[]) => {
  const outPath = path.join(path.dirname(pg.data), `${program}.out`)
  const out = openSync(outPath, 'w')
  try {
    execFileSync(path.join(pg.bin, `${program}.exe`), args, { stdio: ['ignore', out, out] })
  } catch (error) {
    throw new Error(`${program} ${args[0]} failed:\n${readFileSync(outPath, 'utf8')}`, { cause: error })
  } finally {
    closeSync(out)
  }
}

export const installPostgres = async (home: string, pg: Postgres) => {
  if (existsSync(path.join(pg.bin, 'pg_ctl.exe'))) return
  console.log(`Downloading PostgreSQL ${version.split('-')[0]} (about 40 MB), once...`)
  const response = await fetch(tarball)
  if (!response.ok) throw new Error(`${tarball} answered ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!matchesIntegrity(bytes, integrity)) throw new Error(`the PostgreSQL download does not match its npm integrity ${integrity}`)
  const staging = path.join(home, 'download')
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  writeFileSync(path.join(staging, 'postgres.tgz'), bytes)
  execFileSync(windowsTar, ['-xzf', 'postgres.tgz', 'package/native'], { cwd: staging, stdio: 'ignore' })
  renameSync(path.join(staging, 'package', 'native'), path.dirname(pg.bin))
  rmSync(staging, { recursive: true, force: true })
}

/** Whether a server runs in the data folder: pg_ctl status exits 3 when none does, and fails before the install. */
const isRunning = (pg: Postgres) => {
  if (!existsSync(path.join(pg.bin, 'pg_ctl.exe'))) return false
  try {
    run(pg, 'pg_ctl', ['status', '-D', pg.data])
    return true
  } catch {
    return false
  }
}

const initdb = (pg: Postgres) => {
  console.log('Creating the database...')
  mkdirSync(path.dirname(pg.data), { recursive: true })
  const pwfile = path.join(path.dirname(pg.data), 'pwfile')
  writeFileSync(pwfile, `${pg.password}\n`)
  try {
    run(pg, 'initdb', [`--pgdata=${pg.data}`, '--auth=scram-sha-256', `--username=${pg.user}`, `--pwfile=${pwfile}`, '--encoding=UTF8', '--locale-provider=builtin', '--builtin-locale=C.UTF-8', '--locale=C'])
  } finally {
    rmSync(pwfile)
  }
}

/** Creates the data folder on the first run and starts the server, or keeps the one already running there. */
export const startPostgres = (pg: Postgres) => {
  if (!existsSync(path.join(pg.data, 'PG_VERSION'))) initdb(pg)
  if (isRunning(pg)) return
  run(pg, 'pg_ctl', ['start', '-w', '-D', pg.data, '-l', pg.log, '-o', `-p ${pg.port} -c listen_addresses=127.0.0.1`])
}

export const stopPostgres = (pg: Postgres) => {
  if (isRunning(pg)) run(pg, 'pg_ctl', ['stop', '-w', '-m', 'fast', '-D', pg.data])
}
