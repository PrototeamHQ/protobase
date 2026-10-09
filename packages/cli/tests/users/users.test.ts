import { Readable } from 'node:stream'
import { getMigrations } from 'better-auth/db/migration'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { beforeAll, describe, expect, it } from 'vitest'
import { createEmptyPg } from '../../../../test-support/pglite-snapshot'
import { createAuth, issueToken, type AdminAuth } from '@protobase/server'
import { createUserCommand, listRolesCommand, listUsersCommand, type UsersApi } from '../../src/users/commands'
import { deleteUserCommand, setDisabledCommand, setRoleCommand } from '../../src/users/manage'
import { usersApi } from '../../src/users/register'

// The users commands over a real Better Auth store, wired as the CLI wires them; cli.integration.test.ts runs the
// binary itself once.
let auth: AdminAuth
let api: UsersApi

beforeAll(async () => {
  auth = createAuth({ database: { dialect: new PGliteDialect(await createEmptyPg()), type: 'postgres' }, baseURL: 'http://localhost:1', secret: 'users-test-secret-users-test-secret-1234' })
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
