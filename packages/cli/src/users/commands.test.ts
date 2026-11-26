import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createMemberCommand, createUserCommand, listRolesCommand, listUsersCommand, type UsersApi } from './commands'
import { pinSourceFixture } from '../organizations/pin-source-fixture'
import { readPasswordFromStream, rejectPasswordArgument, resolvePassword } from './password'

// Without organizations unless `organizationsOn` says otherwise.
const api = (existing: boolean, organizationsOn = false): UsersApi => ({
  ...pinSourceFixture({ organizationsOn }),
  addMember: vi.fn(async () => undefined),
  roles: async () => ({ roles: ['admin', 'auditor'], defaultRole: 'auditor', labels: { admin: 'Superuser', auditor: 'Auditor', user: 'User' } }),
  hasUsers: async () => existing,
  createUser: vi.fn(async (input) => ({ id: '1', email: input.email, role: input.role ?? 'auditor' })),
  listUsers: async () => ({ users: [{ id: '1', email: 'a@example.com', role: 'admin', createdAt: '2026-10-07' }] }),
  deleteUser: vi.fn(async () => {}),
  setUserRole: vi.fn(async ({ email, role }) => ({ email, role })),
  setUserBanned: vi.fn(async () => {}),
})

const deps = (stdin = '', answers: string[] = []) => ({
  stdin: Readable.from([stdin]),
  prompt: async () => answers.shift() ?? '',
})

const base = { passwordStdin: false, generatePassword: false }

describe('createUserCommand', () => {
  it('makes the first user an admin, whatever role is asked for', async () => {
    const users = api(false)
    const out: string[] = []
    await createUserCommand(users, { ...base, email: 'me@example.com', role: 'viewer', passwordStdin: true }, deps('a-long-password\n'), (t) => out.push(t))
    expect(users.createUser).toHaveBeenCalledWith({ email: 'me@example.com', password: 'a-long-password', role: 'admin' })
    expect(out.join('')).toBe('Created admin me@example.com, shown in the app as Superuser\n')
  })

  it('uses the requested role for later users', async () => {
    const users = api(true)
    await createUserCommand(users, { ...base, email: 'b@example.com', role: 'viewer', name: 'B', passwordStdin: true }, deps('another-password'), () => {})
    expect(users.createUser).toHaveBeenCalledWith({ email: 'b@example.com', password: 'another-password', role: 'viewer', name: 'B' })
  })

  it('leaves the role to the project default for later users', async () => {
    const users = api(true)
    await createUserCommand(users, { ...base, email: 'c@example.com', passwordStdin: true }, deps('yet-another-password'), () => {})
    expect(users.createUser).toHaveBeenCalledWith({ email: 'c@example.com', password: 'yet-another-password' })
  })

  it('prints a generated password once', async () => {
    const users = api(false)
    const out: string[] = []
    await createUserCommand(users, { ...base, email: 'me@example.com', generatePassword: true }, deps(), (t) => out.push(t))
    const { password } = vi.mocked(users.createUser).mock.calls[0]![0]
    expect(password!.length).toBeGreaterThanOrEqual(24)
    expect(out.join('')).toContain(`Password (shown once): ${password}`)
  })

  it('makes a user without a password, asking for none', async () => {
    const users = api(false)
    const out: string[] = []
    await createUserCommand(users, { ...base, email: 'me@example.com', noPassword: true }, deps('', ['never-asked']), (t) => out.push(t))
    expect(users.createUser).toHaveBeenCalledWith({ email: 'me@example.com', role: 'admin' })
    expect(out.join('')).toBe('Created admin me@example.com, shown in the app as Superuser\n')
  })

  it('links the user to a GitHub user id', async () => {
    const users = api(true)
    const out: string[] = []
    await createUserCommand(users, { ...base, email: 'octo@example.com', role: 'user', githubId: '583231', passwordStdin: true }, deps('a-long-password'), (t) => out.push(t))
    expect(users.createUser).toHaveBeenCalledWith({ email: 'octo@example.com', password: 'a-long-password', role: 'user', accounts: [{ providerId: 'github', accountId: '583231' }] })
    expect(out.join('')).toBe('Created user octo@example.com, linked to GitHub user 583231\n')
  })

  it('rejects a GitHub id that is not a number before asking for anything', async () => {
    await expect(createUserCommand(api(true), { ...base, email: 'octo@example.com', githubId: 'octocat' }, deps(), () => {})).rejects.toThrow('"octocat" is not a GitHub user id')
  })

  it('rejects a bad email before asking for anything', async () => {
    await expect(createUserCommand(api(false), { ...base, email: 'nope' }, deps(), () => {})).rejects.toThrow('not an email')
  })
})

describe('passwords', () => {
  it('refuses a password given as an argument', () => {
    expect(() => rejectPasswordArgument('hunter2hunter2')).toThrow('Passwords are never accepted as arguments')
    expect(() => rejectPasswordArgument(undefined)).not.toThrow()
    expect(() => rejectPasswordArgument(false)).not.toThrow()
  })

  it('reads --password-stdin without the trailing newline', async () => {
    expect(await readPasswordFromStream(Readable.from(['secret-password\r\n']))).toBe('secret-password')
    await expect(readPasswordFromStream(Readable.from(['\n']))).rejects.toThrow('No password on stdin')
  })

  it('asks twice and compares', async () => {
    const result = await resolvePassword(base, deps('', ['same-password', 'same-password']))
    expect(result).toEqual({ password: 'same-password', generated: false })
    await expect(resolvePassword(base, deps('', ['one', 'two']))).rejects.toThrow('do not match')
  })

  it("refuses a password the app's sign-in would not take, from stdin or the prompt", async () => {
    await expect(resolvePassword({ ...base, passwordStdin: true }, deps('short\n'))).rejects.toThrow('Choose a password of 12 to 128 characters')
    await expect(resolvePassword({ ...base, passwordStdin: true }, deps('x'.repeat(129)))).rejects.toThrow('Choose a password of 12 to 128 characters')
    await expect(resolvePassword(base, deps('', ['short', 'short']))).rejects.toThrow('Choose a password of 12 to 128 characters')
    expect(await resolvePassword({ ...base, passwordStdin: true }, deps('twelve-chars'))).toEqual({ password: 'twelve-chars', generated: false })
  })

  it('refuses conflicting sources', async () => {
    await expect(resolvePassword({ passwordStdin: true, generatePassword: true }, deps())).rejects.toThrow('Use only one of')
    await expect(resolvePassword({ passwordStdin: false, generatePassword: true, noPassword: true }, deps())).rejects.toThrow('Use only one of')
  })
})

describe('listRolesCommand', () => {
  it('marks the default role', async () => {
    const out: string[] = []
    await listRolesCommand(api(true), (t) => out.push(t))
    expect(out.join('')).toBe('admin\nauditor  (default for new users)\n')
  })
})

describe('listUsersCommand', () => {
  it('prints email, role and creation date only', async () => {
    const out: string[] = []
    await listUsersCommand(api(true), {}, (t) => out.push(t))
    expect(out.join('')).toBe('EMAIL          ROLE      CREATED\na@example.com  admin     2026-10-07\n')
  })

  it('prints every page, from the next of the page before, under one header', async () => {
    const pages: Record<string, Awaited<ReturnType<UsersApi['listUsers']>>> = {
      first: { users: [{ id: '1', email: 'a@example.com', role: 'admin', createdAt: '2026-10-07' }], next: { createdAt: '2026-10-07 00:00:00+00', id: '1' } },
      '1': { users: [{ id: '2', email: 'b@example.com', role: 'user', createdAt: '2026-10-08', banned: true }] },
    }
    const listUsers = vi.fn(async (_scope: unknown, after?: { id: string }) => pages[after?.id ?? 'first']!)
    const out: string[] = []
    await listUsersCommand({ ...api(true), listUsers }, {}, (t) => out.push(t))
    expect(listUsers).toHaveBeenLastCalledWith(undefined, { createdAt: '2026-10-07 00:00:00+00', id: '1' })
    expect(out.join('')).toBe('EMAIL          ROLE      CREATED\na@example.com  admin     2026-10-07\nb@example.com  user      2026-10-08  disabled\n')
  })
})

describe('listUsersCommand with organizations', () => {
  const listed = async (options: { organization?: string; allOrganizations?: boolean }) => {
    const users = { ...api(true, true), listUsers: vi.fn(async (_scope: unknown) => ({ users: [{ id: '1', email: 'bo@example.com', role: 'user', createdAt: '2026-10-07' }] })) }
    const out: string[] = []
    await listUsersCommand(users, options, (t) => out.push(t))
    return { scope: users.listUsers.mock.calls[0]![0], text: out.join('') }
  }

  it('lists the members of the pinned organization', async () => {
    expect(await listed({})).toEqual({ scope: '1', text: 'Organization: acme (Acme)\nEMAIL           ROLE      CREATED\nbo@example.com  user      2026-10-07\n' })
  })

  it('lists the members of the organization --organization names', async () => {
    const { scope, text } = await listed({ organization: 'globex' })
    expect(scope).toBe('2')
    expect(text).toMatch(/^Organization: globex \(Globex\)\n/)
    await expect(listed({ organization: 'initech' })).rejects.toThrow('No organization "initech"')
  })

  it('lists every user with --all-organizations', async () => {
    const { scope, text } = await listed({ allOrganizations: true })
    expect(scope).toEqual({ unscoped: 'protobase users list: --all-organizations' })
    expect(text).toMatch(/^Every organization\n/)
  })
})

describe('createMemberCommand', () => {
  const create = async (users: UsersApi, options: { organization?: string; allOrganizations?: boolean; orgRole?: string; appRoles?: string }) => {
    const out: string[] = []
    await createMemberCommand(users, { ...base, email: 'jan@example.com', noPassword: true, role: 'auditor', ...options }, deps(), (t) => out.push(t))
    return out.join('')
  }

  it('adds the new user to no organization without --organization, and refuses roles there', async () => {
    const users = api(true, true)
    expect(await create(users, {})).toBe('Created auditor jan@example.com\njan@example.com joins no organization\n')
    await expect(create(users, { orgRole: 'admin' })).rejects.toThrow('need --organization')
    await expect(create(users, { appRoles: 'sales' })).rejects.toThrow('need --organization')
    expect(users.createUser).toHaveBeenCalledTimes(1)
    expect(users.addMember).not.toHaveBeenCalled()
  })

  it('adds the new user to the organization --organization names', async () => {
    const users = api(true, true)
    expect(await create(users, { organization: 'globex', orgRole: 'admin', appRoles: 'sales' })).toBe('Created auditor jan@example.com\nAdded jan@example.com to globex as admin\n')
    expect(users.addMember).toHaveBeenCalledWith({ organization: '2', email: 'jan@example.com', role: 'admin', appRoles: ['sales'] })
    await expect(create(api(true, true), { organization: 'initech' })).rejects.toThrow('No organization "initech"')
  })

  it('adds the new user to the default organization when --organization names it', async () => {
    const users = api(true, true)
    expect(await create(users, { organization: 'acme', orgRole: 'owner' })).toBe('Created auditor jan@example.com\nAdded jan@example.com to acme as owner\n')
    expect(users.addMember).toHaveBeenCalledWith({ organization: '1', email: 'jan@example.com', role: 'owner' })
  })

  it('creates the account in no organization with --all-organizations', async () => {
    const users = api(true, true)
    expect(await create(users, { allOrganizations: true })).toBe('Created auditor jan@example.com\njan@example.com joins no organization\n')
    expect(users.addMember).not.toHaveBeenCalled()
  })

  it('leaves the first user as the owner of the organization named when it owns it already, such as one a seed made', async () => {
    const users = { ...api(false, true), isMember: async () => true }
    expect(await create(users, { organization: 'globex' })).toBe('Created admin jan@example.com, shown in the app as Superuser\njan@example.com owns globex\n')
    expect(users.addMember).not.toHaveBeenCalled()
  })

  it('leaves the first user in no organization without --organization on an empty store', async () => {
    // An isMember that answers yes would print the first user's ownership if it were reached.
    const isMember = vi.fn(async () => true)
    const users = { ...api(false, true), isMember }
    expect(await create(users, {})).toBe('Created admin jan@example.com, shown in the app as Superuser\njan@example.com joins no organization\n')
    expect(isMember).not.toHaveBeenCalled()
    expect(users.addMember).not.toHaveBeenCalled()
  })

  it('creates the account alone while organizations are off', async () => {
    const users = api(true)
    expect(await create(users, {})).toBe('Created auditor jan@example.com\n')
    expect(users.addMember).not.toHaveBeenCalled()
  })

  it('refuses the pin flags while organizations are off, creating nobody', async () => {
    const users = api(true)
    await expect(create(users, { allOrganizations: true })).rejects.toThrow('needs organizations')
    await expect(create(users, { organization: 'acme' })).rejects.toThrow('need organizations')
    expect(users.createUser).not.toHaveBeenCalled()
  })
})

describe('createUserCommand with organizations', () => {
  it('makes the account alone, in no organization, as the serve runtime\'s create-admin does', async () => {
    const users = api(true, true)
    const out: string[] = []
    await createUserCommand(users, { ...base, email: 'jan@example.com', noPassword: true, role: 'admin' }, deps(), (t) => out.push(t))
    expect(out.join('')).toBe('Created admin jan@example.com, shown in the app as Superuser\n')
    expect(users.addMember).not.toHaveBeenCalled()
  })
})
