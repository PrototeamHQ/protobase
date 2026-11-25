import { Readable } from 'node:stream'
import { beforeAll, describe, expect, it } from 'vitest'
import { authSchemaMigration, issueToken, type AdminAuth } from '@protobase/server'
import { buildAuth, createAuth, modelHash, runtimeModel, storeNamesList } from '@protobase/server/internal'
import { recordBlock } from '../../src/migration/record/record-block'
import { createUserCommand, listRolesCommand, listUsersCommand, type UsersApi } from '../../src/users/commands'
import { deleteUserCommand, setDisabledCommand, setRoleCommand } from '../../src/users/manage'
import { setDisabledInProject } from '../../src/users/set-disabled'
import { usersApi } from '../../src/users/users-api'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'

// The users commands over a real Better Auth store, wired as the CLI wires them; the setup of dev.integration.test.ts
// runs the binary itself once.
let auth: AdminAuth
let api: UsersApi

beforeAll(async () => {
  const store = await openSnapshotDb('empty')
  auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: 'http://localhost:1', secret: 'users-test-secret-users-test-secret-1234' })
  await store.exec((await authSchemaMigration(auth))!)
  api = usersApi(auth)
})

const output = async (command: (out: (text: string) => void) => Promise<unknown>) => {
  const written: string[] = []
  await command((text) => written.push(text))
  return written.join('')
}

const create = (email: string, role?: string) =>
  output((out) => createUserCommand(api, { email, role, passwordStdin: true, generatePassword: false }, { stdin: Readable.from(['a-long-test-password\n']), prompt: async () => '' }, out))

describe('protobase users against a Better Auth store', () => {
  it('creates the first admin, whatever role is asked for', async () => {
    expect(await create('me@example.com', 'viewer')).toBe('Created admin me@example.com, shown in the app as Superuser\n')
  })

  it('lists the user without credentials', async () => {
    const listed = await output((out) => listUsersCommand(api, {}, out))
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
    expect(await output((out) => listUsersCommand(api, {}, out))).toMatch(/staff@example\.com\s+user\s+\S+\s+disabled/)
    await expect(issueToken(auth, { email: 'staff@example.com' })).rejects.toThrow('staff@example.com is banned')
    expect(await output((out) => setDisabledCommand(api, { email: 'staff@example.com', disabled: false }, out))).toBe('Enabled staff@example.com\n')
    expect((await issueToken(auth, { email: 'staff@example.com' })).token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
  })

  it('changes roles and deletes once another admin exists', async () => {
    expect(await output((out) => setRoleCommand(api, { email: 'staff@example.com', role: 'admin' }, out))).toBe('staff@example.com is now admin\n')
    await setRoleCommand(api, { email: 'me@example.com', role: 'user' }, () => {})
    expect(await output((out) => deleteUserCommand(api, { email: 'me@example.com', yes: true }, async () => '', out))).toBe('Deleted me@example.com\n')
    const listed = await output((out) => listUsersCommand(api, {}, out))
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
    expect(await output((out) => listUsersCommand(api, {}, out))).not.toContain('other@example.com')
  })
})

describe('protobase users disable and enable', () => {
  it('refuse on a database whose record of migrations lacks the store, changing nobody, and act once it has it', async () => {
    const store = await openSnapshotDb('empty')
    const made = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: 'http://localhost:1', secret: 'users-test-secret-users-test-secret-1234' })
    // The store's tables, without the file's row in the record of migrations.
    await store.exec((await authSchemaMigration(made))!)
    const create = (email: string) => createUserCommand(usersApi(made), { email, passwordStdin: true, generatePassword: false }, { stdin: Readable.from(['a-long-test-password\n']), prompt: async () => '' }, () => {})
    await create('root@example.com')
    await create('ana@example.com')

    await expect(setDisabledInProject(made, {}, { email: 'ana@example.com', disabled: true }, () => {})).rejects.toThrow(/^The database has no migration recorded in migrations\.history/)
    expect((await issueToken(made, { email: 'ana@example.com' })).token).toBeTruthy()

    const model = runtimeModel(made, {})
    await store.exec(recordBlock({ id: 'auth', number: 1, name: '001_auth', protobaseVersion: '1.0.0', model, modelHash: modelHash(model), physical: { auth: storeNamesList(model.auth!) }, additive: true, completed: true }, null))
    await setDisabledInProject(made, {}, { email: 'ana@example.com', disabled: true }, () => {})
    await expect(issueToken(made, { email: 'ana@example.com' })).rejects.toThrow('ana@example.com is banned')
  })
})
