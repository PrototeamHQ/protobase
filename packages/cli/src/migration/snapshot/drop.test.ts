import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeCustomMigration } from './custom'
import { dropMigration } from './drop'
import { authOf, cleanProjects, counterIds, migrate, migrationsOf, newProject, olderProject, projectFiles } from './project-fixture'

afterEach(cleanProjects)

const custom = (dir: string, name: string, recordConfig = false, auth = authOf()) =>
  writeCustomMigration({ projectDir: dir, dir: migrationsOf(dir), name, recordConfig, auth, protobaseVersion: '1.0.0', newId: () => `id-${name}` })

describe('protobase migration drop', () => {
  it('deletes the newest file and takes the snapshot back to the one before it, byte for byte', async () => {
    const dir = await olderProject(3)
    const before = await projectFiles(dir)
    await migrate(dir, authOf(), counterIds(), '1.1.0')
    expect(await dropMigration(dir, migrationsOf(dir))).toBe('002_auth.sql')
    expect(await projectFiles(dir)).toEqual(before)
  })

  it('removes the snapshot with the first file', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    expect(await dropMigration(dir, migrationsOf(dir))).toBe('001_auth.sql')
    expect(await projectFiles(dir)).toEqual({})
  })

  it("refuses while two files share a number, so another branch's file stays", async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    await writeFile(path.join(migrationsOf(dir), '001_orders.sql'), '')
    await expect(dropMigration(dir, migrationsOf(dir))).rejects.toThrow("001_auth.sql and 001_orders.sql share a number. Delete this branch's newest migration")
    expect((await readdir(migrationsOf(dir))).sort()).toEqual(['001_auth.sql', '001_orders.sql'])
  })

  it('drops a hand-written file, but refuses one that recorded a changed config', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    await custom(dir, 'orders')
    expect(await dropMigration(dir, migrationsOf(dir))).toBe('002_orders.sql')
    const renamed = authOf({ tables: { session: { name: 'sessions' } } })
    await custom(dir, 'rename_sessions', true, renamed)
    await expect(dropMigration(dir, migrationsOf(dir))).rejects.toThrow('002_rename_sessions.sql changed more than the steps, so the snapshot before it cannot be rebuilt')
  })

  it('deletes the .after.sql of the file it drops too', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    await writeCustomMigration({ projectDir: dir, dir: migrationsOf(dir), name: 'indexes', recordConfig: false, after: true, auth: authOf(), protobaseVersion: '1.0.0', newId: () => 'id-indexes' })
    expect(await dropMigration(dir, migrationsOf(dir))).toBe('002_indexes.sql')
    expect(await readdir(migrationsOf(dir))).toEqual(['001_auth.sql'])
  })

  it('refuses without a snapshot', async () => {
    await expect(dropMigration(await newProject(), 'db/migrations')).rejects.toThrow("The project has no protobase.snapshot.json: no migration of Protobase's to drop")
  })
})
