import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkMigrations } from './check'
import { writeCustomMigration } from './custom'
import { authOf, cleanProjects, migrate, migrationsOf, newProject } from './project-fixture'
import { readSnapshot, writeSnapshot } from './snapshot-file'

afterEach(cleanProjects)

const check = (dir: string, auth = authOf()) => checkMigrations(dir, migrationsOf(dir), auth)

const custom = (dir: string, name: string) => writeCustomMigration({ projectDir: dir, dir: migrationsOf(dir), name, recordConfig: false, auth: authOf(), protobaseVersion: '1.0.0', newId: () => `id-${name}` })

describe('protobase migration check', () => {
  it('finds nothing once the migrations make what the config needs', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    expect(await check(dir)).toEqual([])
  })

  it('reports a config the migrations lack', async () => {
    const dir = await newProject()
    expect(await check(dir)).toEqual(['the config and this version of Protobase need auth store steps the migrations lack: run `protobase migration`'])
    await migrate(dir, authOf())
    expect(await check(dir, authOf({ tables: { session: { columns: { token: 'session_token' } } } }))).toEqual(['the auth store\'s modules.auth.session.columns.token is "token" in the snapshot and "session_token" now'])
  })

  it('reports two files that share a number', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    await writeFile(path.join(migrationsOf(dir), '001_orders.sql'), 'create table orders (id int);\n')
    expect(await check(dir)).toEqual(['001_auth.sql and 001_orders.sql share a number'])
  })

  it('reports a snapshot that does not end at the newest file Protobase wrote', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    const snapshot = (await readSnapshot(dir))!
    await custom(dir, 'orders')
    await writeSnapshot(dir, snapshot)
    expect(await check(dir)).toEqual(['protobase.snapshot.json ends at 001_auth.sql, not at the newest migration Protobase wrote, 002_orders.sql'])
  })

  it('reports a model edited by hand', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    const snapshot = (await readSnapshot(dir))!
    await writeSnapshot(dir, { ...snapshot, model: { auth: { ...snapshot.model.auth!, userMetadata: 'meta' } } })
    expect(await check(dir)).toContain("protobase.snapshot.json's model does not match its modelHash: it was edited or merged by hand")
  })

  it('lints a hand-written migration marked additive, and only that one', { timeout: 30_000 }, async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    const file = await custom(dir, 'orders')
    const text = await readFile(file, 'utf8')
    await writeFile(file, `${text}drop table orders;\n`)
    expect(await check(dir)).toEqual([])
    await writeFile(file, `${text.replace('-- protobase:custom\n', '-- protobase:custom\n-- protobase:additive\n')}drop table orders;\n`)
    expect(await check(dir)).toEqual([expect.stringMatching(/^002_orders\.sql is marked additive and breaks ban-drop-table: /)])
    await writeFile(file, `${text.replace('-- protobase:custom\n', '-- protobase:custom\n-- protobase:additive\n')}create table orders (id int, code text);\ncreate unique index orders_code_uidx on orders (code);\n`)
    expect(await check(dir)).toEqual([])
  })

  it('reports a file Protobase wrote in a project without a snapshot', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    await rename(path.join(dir, 'protobase.snapshot.json'), path.join(dir, 'old.json'))
    expect(await check(dir)).toContain('001_auth.sql was written by `protobase migration`, and the project has no protobase.snapshot.json')
  })
})
