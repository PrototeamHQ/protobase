import { Readable } from 'node:stream'
import { getMigrations } from 'better-auth/db/migration'
import { beforeAll, describe, expect, it } from 'vitest'
import { authSchemaMigration, createAuth, issueToken, type AdminAuth } from '@protobase/server'
import { createUserCommand, listRolesCommand, listUsersCommand, type UsersApi } from '../../src/users/commands'
import { deleteUserCommand, setDisabledCommand, setRoleCommand } from '../../src/users/manage'
import { setDisabledInProject } from '../../src/users/set-disabled'
import { usersApi } from '../../src/users/users-api'
import { openSnapshotDb, settled, type SnapshotDb } from '../../../../test-support/sql-snapshot'

// The users commands over a real Better Auth store, wired as the CLI wires them; the setup of dev.integration.test.ts
// runs the binary itself once.
let auth: AdminAuth
let api: UsersApi

beforeAll(async () => {
  auth = createAuth({ database: { dialect: (await openSnapshotDb('empty')).dialect, type: 'postgres' }, baseURL: 'http://localhost:1', secret: 'users-test-secret-users-test-secret-1234' })
  // Its schema check runs in the background once its context is made, which a busy machine can take longer for than
  // settled() waits; let it finish before the migration's queries.
  await auth.$context
  await settled()
  await (await getMigrations(auth.options)).runMigrations()
  api = usersApi(auth)
})

const output = async (command: (out: (text: string) => void) => Promise<void>) => {
  const written: string[] = []
  await command((text) => written.push(text))
  return written.join('')
}

const create = (email: string, role?: string) =>
  output((out) => createUserCommand(api, { email, role, passwordStdin: true, generatePassword: false }, { stdin: Readable.from(['a-long-test-password\n']), prompt: async () => '' }, out))

describe('protobase users against a Better Auth store', () => {
  it('creates the first admin, whatever role is asked for', async () => {
    expect(await create('me@example.com', 'viewer')).toBe('Created admin me@example.com\n')
  })

  it('lists the user without credentials', async () => {
    const listed = await output((out) => listUsersCommand(api, out))
    expect(listed).toMatch(/me@example\.com\s+admin\s+\d{4}-\d{2}-\d{2}T/)
    expect(listed).not.toContain('long-test-password')
  })

  it('lists the project roles, admin first', async () => {
    expect((await output((out) => listRolesCommand(api, out))).split('\n')[0]).toBe('admin')
  })

  it('refuses to demote or delete the last admin', async () => {
    expect(await create('staff@example.com')).toBe('Created user staff@example.com\n')
    await expect(setRoleCommand(api, { email: 'me@example.com', role: 'user' }, () => {})).rejects.toThrow(/last .*admin/i)
    await expect(deleteUserCommand(api, { email: 'me@example.com', yes: true }, async () => '', () => {})).rejects.toThrow(/last .*admin/i)
  })

  it('disables a user, which stops tokens, and enables them again', async () => {
    await setDisabledCommand(api, { email: 'staff@example.com', disabled: true }, () => {})
    expect(await output((out) => listUsersCommand(api, out))).toMatch(/staff@example\.com\s+user\s+\S+\s+disabled/)
    await expect(issueToken(auth, { email: 'staff@example.com' })).rejects.toThrow('staff@example.com is banned')
    expect(await output((out) => setDisabledCommand(api, { email: 'staff@example.com', disabled: false }, out))).toBe('Enabled staff@example.com\n')
    expect((await issueToken(auth, { email: 'staff@example.com' })).token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
  })

  it('changes roles and deletes once another admin exists', async () => {
    expect(await output((out) => setRoleCommand(api, { email: 'staff@example.com', role: 'admin' }, out))).toBe('staff@example.com is now admin\n')
    await setRoleCommand(api, { email: 'me@example.com', role: 'user' }, () => {})
    expect(await output((out) => deleteUserCommand(api, { email: 'me@example.com', yes: true }, async () => '', out))).toBe('Deleted me@example.com\n')
    const listed = await output((out) => listUsersCommand(api, out))
    expect(listed).not.toContain('me@example.com')
    expect(listed).toContain('staff@example.com')
  })
})

describe('protobase users create --github-id', () => {
  const createLinked = (email: string, githubId: string) =>
    output((out) => createUserCommand(api, { email, githubId, passwordStdin: true, generatePassword: false }, { stdin: Readable.from(['a-long-test-password\n']), prompt: async () => '' }, out))
  const githubAccounts = async () => {
    const { adapter } = await auth.$context
    const accounts = await adapter.findMany<{ userId: string; accountId: string }>({ model: 'account', where: [{ field: 'providerId', value: 'github' }] })
    const users = await adapter.findMany<{ id: string; email: string }>({ model: 'user' })
    return accounts.map((account) => ({ email: users.find((user) => user.id === account.userId)?.email, accountId: account.accountId }))
  }

  it('links the new user to the GitHub user, besides their password', async () => {
    expect(await createLinked('octo@example.com', '583231')).toBe('Created user octo@example.com, linked to GitHub user 583231\n')
    expect(await githubAccounts()).toEqual([{ email: 'octo@example.com', accountId: '583231' }])
  })

  it('refuses a GitHub user that signs in someone else already, and creates nobody', async () => {
    await expect(createLinked('other@example.com', '583231')).rejects.toThrow('The github account 583231 signs in another user already')
    expect(await output((out) => listUsersCommand(api, out))).not.toContain('other@example.com')
  })
})

describe('protobase users disable and enable with MCP turned off', () => {
  it('refuse while the OAuth tables of MCP are left, changing nobody, and act once their drop is applied', async () => {
    // Better Auth's own tables, to which the migration adds those of MCP.
    const store = await openSnapshotDb('auth')
    const authOf = async (mcp: boolean) => {
      const made = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: 'http://localhost:1', secret: 'users-test-secret-users-test-secret-1234', ...(mcp && { mcp: true as const }) })
      await made.$context
      await settled()
      return made
    }
    // Better Auth checks the schema once per instance, so the commands use an instance made after the migration.
    await store.exec((await authSchemaMigration(await authOf(true)))!)
    const on = await authOf(true)
    const create = (email: string) => createUserCommand(usersApi(on), { email, passwordStdin: true, generatePassword: false }, { stdin: Readable.from(['a-long-test-password\n']), prompt: async () => '' }, () => {})
    await create('root@example.com')
    await create('ana@example.com')
    await create('bo@example.com')
    await usersApi(on).setUserBanned({ email: 'bo@example.com', banned: true })

    const off = await authOf(false)
    const leftover = /still has the tables of the OAuth provider for MCP .*`protobase auth migration`/
    await expect(setDisabledInProject(off, { email: 'ana@example.com', disabled: true }, () => {})).rejects.toThrow(leftover)
    expect((await issueToken(off, { email: 'ana@example.com' })).token).toBeTruthy()
    await expect(setDisabledInProject(off, { email: 'bo@example.com', disabled: false }, () => {})).rejects.toThrow(leftover)
    await expect(issueToken(off, { email: 'bo@example.com' })).rejects.toThrow('bo@example.com is banned')

    await store.exec((await authSchemaMigration(off))!)
    await setDisabledInProject(off, { email: 'ana@example.com', disabled: true }, () => {})
    await expect(issueToken(off, { email: 'ana@example.com' })).rejects.toThrow('ana@example.com is banned')
  })
})
