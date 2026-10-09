import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createUserCommand, listRolesCommand, listUsersCommand, type UsersApi } from './commands'
import { readPasswordFromStream, rejectPasswordArgument, resolvePassword } from './password'

const api = (existing: boolean): UsersApi => ({
  roles: async () => ({ roles: ['admin', 'auditor'], defaultRole: 'auditor' }),
  hasUsers: async () => existing,
  createUser: vi.fn(async (input) => ({ id: '1', email: input.email, role: input.role })),
  listUsers: async () => [{ id: '1', email: 'a@example.com', role: 'admin', createdAt: '2026-10-07' }],
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
    expect(out.join('')).toBe('Created admin me@example.com\n')
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
    expect(password.length).toBeGreaterThanOrEqual(24)
    expect(out.join('')).toContain(`Password (shown once): ${password}`)
  })

  it('rejects a bad email before asking for anything', async () => {
    await expect(createUserCommand(api(false), { ...base, email: 'nope' }, deps(), () => {})).rejects.toThrow('not an email')
  })
})

describe('passwords', () => {
  it('refuses a password given as an argument', () => {
    expect(() => rejectPasswordArgument('hunter2hunter2')).toThrow('Passwords are never accepted as arguments')
    expect(() => rejectPasswordArgument(undefined)).not.toThrow()
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

  it('refuses conflicting sources', async () => {
    await expect(resolvePassword({ passwordStdin: true, generatePassword: true }, deps())).rejects.toThrow('not both')
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
    await listUsersCommand(api(true), (t) => out.push(t))
    expect(out.join('')).toBe('EMAIL          ROLE      CREATED\na@example.com  admin     2026-10-07\n')
  })
})
