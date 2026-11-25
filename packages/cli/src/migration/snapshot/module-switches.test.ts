import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { authOf, cleanProjects, counterIds, migrationsOf, newProject, testOrganizations } from './project-fixture'
import { runMigration, type MigrationRun } from './run-migration'
import { readSnapshot } from './snapshot-file'
import { checkMigrations } from './check'

afterEach(cleanProjects)

const tokensOn = authOf({ personalAccessTokens: { prefix: 'app_' } })
// Tokens on, with organizations turned off after they were on: the config keeps their default organization.
const tokensOnAfterOrganizations = { ...tokensOn, organizations: testOrganizations }
const tokensOff = authOf()

const ids = counterIds()
const migrate = (projectDir: string, run: Partial<MigrationRun>) =>
  runMigration({ projectDir, dir: migrationsOf(projectDir), auth: tokensOff, modules: {}, database: undefined, protobaseVersion: '1.0.0', newId: ids, ...run })

describe('turning a module off', () => {
  it('refuses without a choice, naming the module and the way through', async () => {
    const dir = await newProject()
    await migrate(dir, { auth: tokensOn })
    await expect(migrate(dir, {})).rejects.toThrow('personal_access_tokens is off in the config while protobase.snapshot.json has its tables. Run `protobase migration` in a terminal to choose what becomes of its tables, or pass `--off keep`.')
    expect(await checkMigrations(dir, migrationsOf(dir), tokensOff, {})).toEqual(['the config turns personal_access_tokens off, which the migrations lack: run `protobase migration`'])
  })

  it('keeps its tables at its step with --off keep, in a file that drops nothing', async () => {
    const dir = await newProject()
    await migrate(dir, { auth: tokensOn })
    const file = await migrate(dir, { off: 'keep' })
    const text = await readFile(file!, 'utf8')
    expect(text).toContain('-- personal_access_tokens off: its tables and rows are kept as they are.')
    expect(text).not.toMatch(/\bdrop (table|column)/)
    const snapshot = (await readSnapshot(dir))!
    expect(snapshot.decisions.modules.kept).toMatchObject([{ module: 'personal_access_tokens', step: 1, tables: { personal_access_token: { name: 'personal_access_token' } } }])
    expect(snapshot.model.auth!.modules.personal_access_tokens).toBeUndefined()
    expect(await migrate(dir, {})).toBeUndefined()
    expect(await checkMigrations(dir, migrationsOf(dir), tokensOff, {})).toEqual([])
  })

  it("takes away not null from the columns it adds to the tables of the modules still on, but a token's organization", async () => {
    const dir = await newProject()
    const organizations = authOf({ organizations: { enabled: true }, personalAccessTokens: { prefix: 'app_' } }, true)
    await migrate(dir, { auth: organizations })
    const text = await readFile((await migrate(dir, { auth: tokensOnAfterOrganizations, off: 'keep' }))!, 'utf8')
    expect(text).toContain('alter table "auth"."user" alter column "last_organization_id" drop not null;')
    expect(text).toContain('alter table "auth"."session" alter column "active_organization_id" drop not null;')
    expect(text).not.toContain('alter table "auth"."personal_access_token" alter column')
  })

  it('relaxes only the tables there before the migration, not one of a module turned on with it', async () => {
    const dir = await newProject()
    await migrate(dir, { auth: authOf({ organizations: { enabled: true } }, true) })
    const text = await readFile((await migrate(dir, { auth: tokensOnAfterOrganizations, off: 'keep' }))!, 'utf8')
    expect(text).toContain('alter table "auth"."session" alter column "active_organization_id" drop not null;')
    expect(text).not.toContain('alter table "auth"."personal_access_token" alter column')
    expect(text).toContain('-- personal_access_tokens 1 ')
  })

  it('asks on a terminal, keep the default', async () => {
    const dir = await newProject()
    await migrate(dir, { auth: tokensOn })
    const asked: string[] = []
    await migrate(dir, { chooseOff: async (modules) => (asked.push(modules.map(({ module }) => module).join()), 'keep') })
    expect(asked).toEqual(['personal_access_tokens'])
  })

  it('refuses archive and delete, which are not available yet', async () => {
    const dir = await newProject()
    await migrate(dir, { auth: tokensOn })
    await expect(migrate(dir, { off: 'archive' })).rejects.toThrow('--off archive is not available yet: a module turned off keeps its tables and rows (--off keep)')
    await expect(migrate(dir, { off: 'delete' })).rejects.toThrow('--off delete is not available yet')
  })
})

describe('turning a kept module on again', () => {
  it('writes the rest of its steps after the one it was kept at, behind the check of its kept rows', async () => {
    const dir = await newProject()
    await migrate(dir, { auth: tokensOn })
    await migrate(dir, { off: 'keep' })
    const text = await readFile((await migrate(dir, { auth: tokensOn }))!, 'utf8')
    expect(text).toContain('-- personal_access_tokens on again: its kept tables must be empty, or the migration applied with `protobase migrate --force`.')
    expect(text).toContain(`if coalesce(current_setting('protobase.force', true), '') <> 'true' then`)
    expect(text).toContain(`select 'personal_access_token' as name, (select count(*) from "auth"."personal_access_token") as rows`)
    expect(text).not.toContain('-- personal_access_tokens 1 ')
    const snapshot = (await readSnapshot(dir))!
    expect(snapshot.decisions.modules.kept).toEqual([])
    expect(snapshot.model.auth!.modules.personal_access_tokens!.lastStep).toBe(1)
    expect(await checkMigrations(dir, migrationsOf(dir), tokensOn, {})).toEqual([])
  })

  it('refuses a name the config changed while it was kept, as its tables keep theirs', async () => {
    const dir = await newProject()
    await migrate(dir, { auth: tokensOn })
    await migrate(dir, { off: 'keep' })
    expect((await readSnapshot(dir))!.decisions.modules.kept[0]!.tables.personal_access_token!.columns.token_hash).toBe('token_hash')
    const renamed = authOf({ personalAccessTokens: { prefix: 'app_' }, tables: { personal_access_token: { columns: { token_hash: 'digest' } } } })
    await expect(migrate(dir, { auth: renamed })).rejects.toThrow('the auth store\'s modules.personal_access_tokens.personal_access_token.columns.token_hash is "token_hash" in the snapshot and "digest" now')
  })

  it('writes again what the modules on add to its tables, which their guard skips where the database has it', async () => {
    const dir = await newProject()
    const both = authOf({ organizations: { enabled: true }, personalAccessTokens: { prefix: 'app_' } }, true)
    await migrate(dir, { auth: both })
    await migrate(dir, { auth: authOf({ organizations: { enabled: true } }, true), off: 'keep' })
    const text = await readFile((await migrate(dir, { auth: both }))!, 'utf8')
    expect(text).toContain('-- organizations 1 organizations, on the tables of personal_access_tokens:')
    expect(text).toContain(`if not exists (select from "auth"."auth_steps" where "module" = 'organizations' and "step" = 1 and "target" = 'personal_access_tokens') then`)
  })
})
