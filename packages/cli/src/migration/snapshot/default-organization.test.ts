import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { authDifference, redescribedSql } from './auth-difference'
import { checkMigrations } from './check'
import { authOf, cleanProjects, counterIds, migrationsOf, newProject, testOrganizations } from './project-fixture'
import { runMigration, type MigrationRun } from './run-migration'
import { readSnapshot } from './snapshot-file'

afterEach(cleanProjects)

const tokensOn = authOf({ personalAccessTokens: { prefix: 'app_' } })
const organizationsOn = authOf({ organizations: { enabled: true }, personalAccessTokens: { prefix: 'app_' } }, true)

const ids = counterIds()
const migrate = (projectDir: string, run: Partial<MigrationRun>) =>
  runMigration({ projectDir, dir: migrationsOf(projectDir), auth: tokensOn, database: undefined, protobaseVersion: '1.0.0', newId: ids, off: 'keep', ...run })

describe('the default organization', () => {
  it('is required to turn organizations on, and the role of the users there already with it', async () => {
    const dir = await newProject()
    await migrate(dir, {})
    await expect(migrate(dir, { auth: { ...organizationsOn, organizations: undefined } })).rejects.toThrow('organizations.default is not set, and organizations are on')
    const roleless = { ...organizationsOn, organizations: { ...testOrganizations, existingUsersRole: undefined } }
    await expect(migrate(dir, { auth: roleless })).rejects.toThrow('organizations.existingUsersRole is not set, and organizations turn on')
    expect(await checkMigrations(dir, migrationsOf(dir), roleless)).toEqual(['organizations.existingUsersRole is not set, and organizations turn on: name the app role every user there already holds in the default organization'])
  })

  it('turning organizations on, is recorded in the snapshot, and the tokens are filled from the .after.sql', async () => {
    const dir = await newProject()
    await migrate(dir, {})
    const file = (await migrate(dir, { auth: organizationsOn }))!
    expect(await readFile(file, 'utf8')).toContain('-- organizations 3 default_organization:')
    const after = await readFile(file.replace(/\.sql$/, '.after.sql'), 'utf8')
    expect(after).toMatch(/^-- organizations 3 default_organization, on the tables of personal_access_tokens: .*\ndo \$fill\$/)
    expect(after).toContain('create index concurrently if not exists "personal_access_token_organization_id_user_id_idx"')
    expect((await readSnapshot(dir))!.decisions.organizations).toEqual({ everOn: true, defaultOrganization: testOrganizations.default })
  })

  it('stays required once organizations were on, though they are off, without asking the role again', async () => {
    const dir = await newProject()
    await migrate(dir, { auth: organizationsOn })
    await expect(migrate(dir, {})).rejects.toThrow('organizations.default is not set, and organizations were on')
    const file = (await migrate(dir, { auth: { ...tokensOn, organizations: { ...testOrganizations, existingUsersRole: undefined } } }))!
    expect(await readFile(file, 'utf8')).toContain('-- organizations off: its tables and rows are kept')
    expect(existsSync(file.replace(/\.sql$/, '.after.sql'))).toBe(false)
  })
})

describe('a store this version describes otherwise', () => {
  it('is recorded anew in a migration that changes nothing, as the tokens once of the whole app', async () => {
    const dir = await newProject()
    await migrate(dir, {})
    const snapshot = (await readSnapshot(dir))!
    const token = snapshot.model.auth!.modules.personal_access_tokens!.tables.personal_access_token!
    token.scope = 'global'
    expect(authDifference(snapshot, tokensOn).migration?.sql).toBe(redescribedSql)
  })
})
