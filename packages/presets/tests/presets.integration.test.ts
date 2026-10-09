import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connectServer, serverReachable, serverUrl } from '../../../scripts/test-db/templates'
import { presets } from '../src/presets'
import { writePreset } from '../src/write-preset'

// Each preset as an app gets it: written out at this repository's version (so bun installs the @protobase packages from
// npm, which must have that version), in a folder outside this repository, on a database of its own whose role is
// what the platform provisions: no superuser, CREATE on its own database only.
const { version } = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'package.json'), 'utf8'))

// The provisioner's statements (protobase-cloud src/databases/provisioner.ts), for one database and its role.
const provision = async (name: string, password: string) => {
  const admin = connectServer()
  await admin.unsafe(`create role ${name} with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls password '${password}'`)
  await admin.unsafe(`create database ${name} template template0`)
  await admin.unsafe(`revoke all on database ${name} from public`)
  await admin.unsafe(`grant connect, temporary, create on database ${name} to ${name}`)
  await admin.end()
  const url = new URL(serverUrl)
  url.pathname = `/${name}`
  const inDatabase = postgres(url.toString(), { max: 1, onnotice: () => {} })
  await inDatabase.unsafe('revoke all on schema public from public')
  await inDatabase.unsafe(`grant usage, create on schema public to ${name}`)
  await inDatabase.end()
  url.username = name
  url.password = password
  return url.toString()
}

const drop = async (name: string) => {
  const admin = connectServer()
  await admin.unsafe(`drop database if exists ${name} with (force)`)
  await admin.unsafe(`drop role if exists ${name}`)
  await admin.end()
}

describe.skipIf(!(await serverReachable())).each(presets)('the $name preset', (preset) => {
  const dir = mkdtempSync(path.join(tmpdir(), `protobase-preset-${preset.name}-`))
  const database = `preset_${preset.name.replace('-', '_')}_${randomBytes(4).toString('hex')}`
  let env: NodeJS.ProcessEnv = {}
  const run = (command: string, ...args: string[]) => {
    const result = spawnSync(command, args, { cwd: dir, env, encoding: 'utf8' })
    expect(result.status, `${command} ${args.join(' ')}\n${result.stdout}${result.stderr}`).toBe(0)
  }

  beforeAll(async () => {
    writePreset(preset, version, dir)
    const url = await provision(database, randomBytes(16).toString('hex'))
    // Only what a job passes: nothing of this repository's environment.
    env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, DATABASE_URL: url, BETTER_AUTH_SECRET: randomBytes(32).toString('base64') }
  })

  afterAll(async () => {
    await drop(database)
    rmSync(dir, { recursive: true, force: true })
  })

  it('installs from its bun.lock unchanged', () => {
    run('bun', 'install', '--frozen-lockfile')
  })

  it('migrates its tables and the auth tables as the tenant role', () => {
    run('bun', 'run', 'db:migrate')
    run('bun', 'run', 'auth:migrate')
  })

  it.skipIf(preset.name === 'scratch')('seeds its base data, with organization 1 named after the app', async () => {
    run('bun', 'run', 'db:seed:base', '--name', 'Acme Holding')
    const sql = postgres(env.DATABASE_URL!, { max: 1 })
    const [organization] = await sql`select id, name from core.organizations`
    await sql.end()
    expect(organization).toEqual({ id: 1, name: 'Acme Holding' })
  })

  // What an app that opts into sample data gets at creation: foreign keys checked, its own triggers switched off and on.
  it.skipIf(preset.name === 'scratch')('loads its sample data as the tenant role', async () => {
    run('bun', 'run', 'db:seed', '--scale', 'small')
    const sql = postgres(env.DATABASE_URL!, { max: 1 })
    const [organizations] = await sql`select count(*)::int as count from core.organizations`
    const [triggers] = await sql`select count(*)::int as disabled from pg_trigger where not tgisinternal and tgenabled = 'D'`
    await sql.end()
    expect({ ...organizations, ...triggers }).toEqual({ count: 2, disabled: 0 })
  })

  it('typechecks and passes its own unit tests', () => {
    run('bun', 'run', 'typecheck')
    run('bun', 'run', 'test')
  })

  // From scratch has no resources yet, which doctor refuses.
  it.skipIf(preset.name === 'scratch')('matches its database according to protobase doctor', () => {
    const result = spawnSync('bun', ['run', 'protobase', 'doctor', '--env', 'DATABASE_URL'], { cwd: dir, env, encoding: 'utf8' })
    expect(result.stdout, result.stderr).toContain('Checked ')
    const errors = result.stdout.split('\n').filter((line) => line.startsWith('  error')).map((line) => line.replace(/^ +error +/, ''))
    expect(errors).toEqual([])
  })

  it('builds its deploy bundle', () => {
    run('bun', 'run', 'build')
    expect(existsSync(path.join(dir, 'dist', 'protobase.bundle.json'))).toBe(true)
  })
})
