import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { MigrationPart } from '../parts'
import { runMigration } from './run-migration'
import { authOf, cleanProjects, counterIds, migrate, migrationsOf, newProject, olderProject, projectFiles } from './project-fixture'
import { readSnapshot } from './snapshot-file'

afterEach(cleanProjects)

describe('protobase migration', () => {
  it('writes the auth store as the first numbered file, starting with its id, and the snapshot that ends at it', async () => {
    const dir = await newProject()
    const file = await migrate(dir, authOf())
    expect(path.relative(dir, file!)).toBe('db/migrations/001_auth.sql')
    const text = await readFile(file!, 'utf8')
    expect(text.split('\n').slice(0, 4)).toEqual([
      '-- protobase:id 00000000-0000-4000-8000-000000000001',
      '-- protobase:version 1.0.0',
      '-- protobase:steps auth=5 two_factor=1 passkeys=2 sign_in_policy=1 staff_sign_in=2 platform_devices=1',
      `-- protobase:model ${(await readSnapshot(dir))!.modelHash}`,
    ])
    expect(text).toContain('\n-- The auth schema changes this version of Protobase needs.\n')
    expect(await readSnapshot(dir)).toMatchObject({
      format: 1,
      protobaseVersion: '1.0.0',
      endsAt: { file: '001_auth.sql', id: '00000000-0000-4000-8000-000000000001' },
      decisions: { modules: { kept: [], archived: [] }, organizations: { everOn: false, defaultOrganization: null } },
    })
  })

  it('writes nothing, the snapshot included, when nothing differs', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    const before = await projectFiles(dir)
    expect(await migrate(dir, authOf())).toBeUndefined()
    expect(await projectFiles(dir)).toEqual(before)
  })

  it('writes nothing for a project with sign-in off and no database', async () => {
    const dir = await newProject()
    expect(await migrate(dir, undefined)).toBeUndefined()
    expect(await projectFiles(dir)).toEqual({})
  })

  it('gives the same file and snapshot, byte for byte, for the same config, version and ids', async () => {
    const [one, two] = [await newProject(), await newProject()]
    await migrate(one, authOf({ generateUserId: 'uuid' }), counterIds())
    await migrate(two, authOf({ generateUserId: 'uuid' }), counterIds())
    expect(await projectFiles(one)).toEqual(await projectFiles(two))
  })

  it('writes the steps a newer Protobase ships that the files lack, as the next file', async () => {
    const dir = await olderProject(3)
    const file = await migrate(dir, authOf(), counterIds(), '1.1.0')
    expect(path.basename(file!)).toBe('002_auth.sql')
    const text = await readFile(file!, 'utf8')
    expect(text).toContain('-- auth 4 verification_pattern_index:')
    expect(text).toContain('-- auth 5 user_name_search:')
    expect(text).not.toContain('-- auth 3 ')
    expect(text).not.toContain('auth_migrations" (\n')
    expect((await readSnapshot(dir))!.model.auth!.modules.auth!.lastStep).toBe(5)
  })

  it('records that organizations were on', async () => {
    const dir = await newProject()
    await migrate(dir, authOf({}, true))
    expect((await readSnapshot(dir))!.decisions.organizations.everOn).toBe(true)
  })

  it('refuses a name the store has that the config changed, pointing at a hand-written migration', async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    await expect(migrate(dir, authOf({ tables: { user: { columns: { role: 'app_role' } } } }))).rejects.toThrow(
      'the auth store\'s modules.auth.user.columns.role is "role" in the snapshot and "app_role" now. Write the change by hand with `protobase migration --custom <name> --record-config`.',
    )
  })

  it('refuses a project with auth migrations from before the snapshot', async () => {
    const dir = await newProject()
    await mkdir(migrationsOf(dir), { recursive: true })
    await writeFile(path.join(migrationsOf(dir), '001_auth.sql'), '-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.\n')
    await expect(migrate(dir, authOf())).rejects.toThrow('start it with `protobase migration baseline`, run against the database')
  })

  it("numbers after the project's own migrations", async () => {
    const dir = await newProject()
    await mkdir(migrationsOf(dir), { recursive: true })
    await writeFile(path.join(migrationsOf(dir), '007_orders.sql'), 'create table orders (id int);\n')
    expect(path.basename((await migrate(dir, authOf()))!)).toBe('008_auth.sql')
  })

  describe("the relay's part, on a database without the sessions table", () => {
    // As the relay's part compares there: the trigger is missing, and only the auth store's steps create the table.
    const relay: MigrationPart = {
      name: 'relay',
      title: 'The relay trigger',
      sql: async ({ authWritten }) => {
        if (!authWritten) throw new Error('no sessions table')
        return 'create trigger relay_session_ended;'
      },
    }
    const withRelay = (dir: string) => runMigration({ projectDir: dir, dir: migrationsOf(dir), auth: authOf(), database: { url: 'postgres://unused', parts: [relay], contractions: async () => [] }, protobaseVersion: '1.0.0', newId: counterIds() })

    it("is written after the auth store's steps the same file writes", async () => {
      const dir = await newProject()
      const file = await withRelay(dir)
      expect(path.basename(file!)).toBe('001_auth_relay.sql')
      const text = await readFile(file!, 'utf8')
      expect(text.indexOf('-- The auth schema changes this version of Protobase needs.')).toBeLessThan(text.indexOf('-- The relay trigger.'))
    })

    it("is compared without the auth store's steps once the file writes none", async () => {
      const dir = await newProject()
      await migrate(dir, authOf())
      await expect(withRelay(dir)).rejects.toThrow('no sessions table')
    })
  })

  it("records the user view of users.keyTable as external, and a snapshot's external user table stays untouched", async () => {
    const dir = await newProject()
    await migrate(dir, authOf({ users: { keyTable: { schema: 'public', table: 'people' } } }))
    expect((await readSnapshot(dir))!.decisions.external).toEqual(['auth.user'])
    expect((await readSnapshot(await olderProject(5)))!.decisions.external).toBeUndefined()

    const older = await olderProject(2)
    const snapshot = (await readSnapshot(older))!
    await writeFile(path.join(older, 'protobase.snapshot.json'), JSON.stringify({ ...snapshot, decisions: { ...snapshot.decisions, external: ['auth.user'] } }))
    const text = await readFile((await migrate(older, authOf()))!, 'utf8')
    expect(text).toContain('-- auth 3 user_indexes:')
    expect(text).not.toContain('on "auth"."user"')
  })
})

