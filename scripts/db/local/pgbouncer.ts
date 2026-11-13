import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { capture, findExecutable, run } from './executables'
import { folder, type Settings } from './settings'

export const configFile = path.join(folder, 'pgbouncer.ini')
const userFile = path.join(folder, 'userlist.txt')
const pidFile = path.join(folder, 'pgbouncer.pid')

/**
 * The pgbouncer.ini docker-compose.yml's PgBouncer image writes from its variables, pointed at the local server:
 * transaction pooling, 200 prepared statements, three server connections per role, statement_timeout tracked, and the
 * superuser on the admin console.
 */
export const pgbouncerConfig = (settings: Pick<Settings, 'user' | 'port' | 'poolerPort'>) => `[databases]
* = host=127.0.0.1 port=${settings.port} auth_user=${settings.user}

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = ${settings.poolerPort}
unix_socket_dir =
auth_file = ${userFile}
auth_type = scram-sha-256
pool_mode = transaction
max_user_connections = 3
max_prepared_statements = 200
ignore_startup_parameters = extra_float_digits
track_extra_parameters = statement_timeout
admin_users = ${settings.user}
pidfile = ${pidFile}
logfile = ${path.join(folder, 'pgbouncer.log')}
`

/** The auth file with the superuser's password in plain text, which scram-sha-256 needs to log in to the server too. */
export const userList = (settings: Pick<Settings, 'user' | 'password'>) => `${quote(settings.user)} ${quote(settings.password)}\n`

/** A field of the auth file: in double quotes, with each double quote inside doubled. */
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`

/**
 * The pid in the pid file when it is this PgBouncer's, started with this folder's config file. A pid file left by a
 * PgBouncer that was killed may name another process by now, which is never signalled.
 */
const runningPid = () => {
  if (!existsSync(pidFile)) return
  const pid = Number(readFileSync(pidFile, 'utf8').trim())
  return isThisPgbouncer(pid) ? pid : undefined
}

/** Whether the process `pid` runs, as this PgBouncer: ps answers 1 and prints nothing for a process that is gone. */
export const isThisPgbouncer = (pid: number, command = capture('ps', ['-p', String(pid), '-o', 'args=']).stdout) =>
  Number.isInteger(pid) && pid > 0 && /\bpgbouncer\b/.test(command) && command.includes(configFile)

/**
 * Starts PgBouncer in front of the local server, when this machine has it on PATH. Without it, the tests that run
 * through a pooler skip, as they do when the Docker one is down.
 */
export const startPgbouncer = (settings: Settings) => {
  const pgbouncer = findExecutable('pgbouncer', undefined)
  if (!pgbouncer) {
    console.log('No pgbouncer on PATH: the tests through PgBouncer will skip')
    return
  }
  if (runningPid()) return
  mkdirSync(folder, { recursive: true })
  writeFileSync(configFile, pgbouncerConfig(settings))
  writeFileSync(userFile, userList(settings), { mode: 0o600 })
  run(pgbouncer, ['--daemon', configFile])
}

/** Stops PgBouncer when it runs: SIGINT lets it finish the transactions in flight, then waits for it to exit. */
export const stopPgbouncer = async () => {
  const pid = runningPid()
  if (!pid) return
  process.kill(pid, 'SIGINT')
  for (let wait = 0; wait < 100; wait++) {
    if (!isThisPgbouncer(pid)) {
      rmSync(pidFile, { force: true })
      return
    }
    await sleep(100)
  }
  throw new Error(`PgBouncer (pid ${pid}) did not stop within 10 seconds`)
}
