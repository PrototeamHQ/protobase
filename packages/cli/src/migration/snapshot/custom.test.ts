import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkMigrations } from './check'
import { writeCustomMigration } from './custom'
import { authOf, cleanProjects, migrate, migrationsOf, newProject } from './project-fixture'
import { readSnapshot } from './snapshot-file'

afterEach(cleanProjects)

const renamed = authOf({ tables: { session: { name: 'sessions' } } })

const custom = (dir: string, recordConfig: boolean) =>
  writeCustomMigration({ projectDir: dir, dir: migrationsOf(dir), name: 'rename_sessions', recordConfig, auth: renamed, protobaseVersion: '1.0.0', newId: () => 'custom-id' })

describe('protobase migration --custom', () => {
  it('writes an empty numbered file marked hand-written and not additive, and makes the snapshot end at it', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    const file = await custom(dir, false)
    expect(path.basename(file)).toBe('002_rename_sessions.sql')
    const text = await readFile(file, 'utf8')
    expect(text).toMatch(/^-- protobase:id custom-id\n/)
    expect(text).toContain('\n-- protobase:custom\n')
    expect(text).not.toContain('\n-- protobase:additive\n')
    expect((await readSnapshot(dir))!.endsAt).toEqual({ file: '002_rename_sessions.sql', id: 'custom-id' })
    expect(await checkMigrations(dir, migrationsOf(dir), renamed)).toEqual([
      'the auth store\'s modules.auth.session.name is "session" in the snapshot and "sessions" now',
      'the auth store\'s modules.auth.session.indexes.session_user_id_idx is "session_user_id_idx" in the snapshot and "sessions_user_id_idx" now',
    ])
  })

  it("records the config's names with --record-config, so the migrations match it", async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    await custom(dir, true)
    expect((await readSnapshot(dir))!.model.auth!.modules.auth!.tables.session!.name).toBe('sessions')
    expect(await checkMigrations(dir, migrationsOf(dir), renamed)).toEqual([])
  })
})
