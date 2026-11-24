import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { offlineStepsMigration, recordTable, settingsStoreNames } from '@protobase/server/internal'
import { migrationText } from '../../src/auth/migration-file'
import { writeBaseline } from '../../src/migration/baseline/write-baseline'
import { textBeforeRecord } from '../../src/migration/record/record-block'
import { checkMigrations } from '../../src/migration/snapshot/check'
import { runMigration } from '../../src/migration/snapshot/run-migration'
import { readSnapshot } from '../../src/migration/snapshot/snapshot-file'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

vi.setConfig({ hookTimeout: 30_000 })

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })
const auth = { names: settingsStoreNames({}), organizationsOn: false }
const every = Array.from({ length: 17 }, (_, at) => at + 1)

const databases: string[] = []
const dirs: string[] = []

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  const sql = maintenance()
  for (const name of databases) await sql.unsafe(`drop database if exists ${name} with (force)`)
  await sql.end()
})

const createDatabase = async () => {
  const name = `protobase_baseline_${randomBytes(4).toString('hex')}`
  const sql = maintenance()
  await sql.unsafe(`create database ${name}`)
  await sql.end()
  databases.push(name)
  return withDatabase(url, name)
}

const query = async <Row extends object>(databaseUrl: string, text: string) => {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  try {
    return [...(await sql.unsafe<Row[]>(text))]
  } finally {
    await sql.end()
  }
}

const versions = async (databaseUrl: string) => (await query<{ version: number }>(databaseUrl, 'select version from auth.auth_migrations order by version')).map((row) => row.version)

// A project whose one auth migration came before the snapshot, as `protobase auth migration` wrote it, applied to a
// database at the former chain's version `last`: the later versions are recorded while the file runs, so it skips
// them, and taken out of the record again.
const olderStore = async (last: number) => {
  const databaseUrl = await createDatabase()
  const projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-baseline-'))
  dirs.push(projectDir)
  const dir = path.join(projectDir, 'db/migrations')
  await mkdir(dir, { recursive: true })
  const file = migrationText(offlineStepsMigration(auth.names, undefined)!.sql)
  await writeFile(path.join(dir, '001_auth.sql'), file)
  const later = every.filter((version) => version > last)
  const skip = later.length === 0 ? '' : `insert into auth.auth_migrations (version, name) select version, 'later' from unnest(array[${later.join(', ')}]) as version;`
  await query(databaseUrl, `create schema auth; create table auth.auth_migrations (version integer primary key, name text not null, applied_at timestamptz default current_timestamp not null); ${skip}`)
  await query(databaseUrl, file)
  if (later.length > 0) await query(databaseUrl, `delete from auth.auth_migrations where version > ${last}`)
  return { databaseUrl, projectDir, dir }
}

const migrate = (projectDir: string, dir: string) => runMigration({ projectDir, dir, auth, database: undefined, protobaseVersion: '1.0.0', newId: randomUUID })

describe.skipIf(!reachable)('protobase migration baseline', () => {
  it('describes a current store in a file that changes nothing, after which the next migration writes nothing', async () => {
    const { databaseUrl, projectDir, dir } = await olderStore(17)
    await expect(migrate(projectDir, dir)).rejects.toThrow('start it with `protobase migration baseline`')

    const file = await writeBaseline({ projectDir, dir, auth, url: databaseUrl, protobaseVersion: '1.0.0', newId: randomUUID })
    expect(path.basename(file)).toBe('002_baseline.sql')
    const text = await readFile(file, 'utf8')
    expect(textBeforeRecord(text)).not.toMatch(/^[^-\n]/m)
    await query(databaseUrl, text)
    expect(await query(databaseUrl, `select name from ${recordTable}`)).toEqual([{ name: '002_baseline' }])
    // The former chain's record stays until a later release.
    expect(await versions(databaseUrl)).toEqual(every)
    expect(await readSnapshot(projectDir)).toMatchObject({
      endsAt: { file: '002_baseline.sql' },
      decisions: { modules: { kept: [], archived: [] }, organizations: { everOn: true, defaultOrganization: null } },
    })

    expect(await migrate(projectDir, dir)).toBeUndefined()
    expect(await checkMigrations(projectDir, dir, auth)).toEqual([])
  })

  it("puts each module of a store at version 8 at its step, so the next migration writes only the later ones", async () => {
    const { databaseUrl, projectDir, dir } = await olderStore(8)
    await query(databaseUrl, await readFile(await writeBaseline({ projectDir, dir, auth, url: databaseUrl, protobaseVersion: '1.0.0', newId: randomUUID }), 'utf8'))
    expect((await readSnapshot(projectDir))!.model.auth!.modules.auth!.lastStep).toBe(1)

    const next = await readFile((await migrate(projectDir, dir))!, 'utf8')
    expect(next).not.toContain('-- auth 1 core')
    expect(next).toContain('-- auth 2 account_keys')
    await query(databaseUrl, next)
    expect(await versions(databaseUrl)).toEqual(every)
    expect(await migrate(projectDir, dir)).toBeUndefined()
  })

  it('refuses a second baseline once the project has the snapshot', async () => {
    const { databaseUrl, projectDir, dir } = await olderStore(17)
    await writeBaseline({ projectDir, dir, auth, url: databaseUrl, protobaseVersion: '1.0.0', newId: randomUUID })
    await expect(writeBaseline({ projectDir, dir, auth, url: databaseUrl, protobaseVersion: '1.0.0', newId: randomUUID })).rejects.toThrow('The project has protobase.snapshot.json already')
  })
})
