import { describe, expect, it, vi } from 'vitest'
import type { UsersApi } from './commands'
import { pinSourceFixture } from '../organizations/pin-source-fixture'
import { deleteUserCommand, setDisabledCommand, setRoleCommand } from './manage'

// Without organizations unless `organizationsOn` says otherwise.
const api = (organizationsOn = false): UsersApi => ({
  ...pinSourceFixture({ organizationsOn }),
  addMember: vi.fn(async () => undefined),
  roles: async () => ({ roles: ['admin', 'user'], labels: {} }),
  hasUsers: async () => true,
  createUser: vi.fn(),
  listUsers: async () => ({ users: [] }),
  deleteUser: vi.fn(async () => {}),
  setUserRole: vi.fn(async ({ email, role }) => ({ email, role })),
  setUserBanned: vi.fn(async () => {}),
})

describe('deleteUserCommand', () => {
  it('deletes after the email is typed back', async () => {
    const users = api()
    const out: string[] = []
    await deleteUserCommand(users, { email: 'b@example.com', yes: false }, async () => ' b@example.com\n', (t) => out.push(t))
    expect(users.deleteUser).toHaveBeenCalledWith('b@example.com')
    expect(out.join('')).toBe('Deleted b@example.com\n')
  })

  it('deletes nothing when the typed email differs', async () => {
    const users = api()
    await expect(deleteUserCommand(users, { email: 'b@example.com', yes: false }, async () => 'nope', () => {})).rejects.toThrow('nothing was deleted')
    expect(users.deleteUser).not.toHaveBeenCalled()
  })

  it('skips the confirmation with --yes', async () => {
    const users = api()
    const confirm = vi.fn()
    await deleteUserCommand(users, { email: 'b@example.com', yes: true }, confirm, () => {})
    expect(confirm).not.toHaveBeenCalled()
    expect(users.deleteUser).toHaveBeenCalled()
  })

  it('lets the last-admin refusal through', async () => {
    const users = api()
    vi.mocked(users.deleteUser).mockRejectedValue(new Error('Cannot delete the last admin'))
    await expect(deleteUserCommand(users, { email: 'a@example.com', yes: true }, vi.fn(), () => {})).rejects.toThrow('last admin')
  })
})

describe('role and disable commands', () => {
  it('sets a role', async () => {
    const out: string[] = []
    await setRoleCommand(api(), { email: 'b@example.com', role: 'admin' }, (t) => out.push(t))
    expect(out.join('')).toBe('b@example.com is now admin\n')
  })

  it('disables and enables', async () => {
    const users = api()
    const out: string[] = []
    await setDisabledCommand(users, { email: 'b@example.com', disabled: true }, (t) => out.push(t))
    await setDisabledCommand(users, { email: 'b@example.com', disabled: false }, (t) => out.push(t))
    expect(vi.mocked(users.setUserBanned).mock.calls.map(([call]) => call.banned)).toEqual([true, false])
    expect(out[0]).toContain('within 15 minutes')
    expect(out[1]).toBe('Enabled b@example.com\n')
  })
})

describe('the account commands with organizations', () => {
  type Run = (users: UsersApi, options: object, out: (text: string) => void) => Promise<void>
  const commands: Record<string, Run> = {
    delete: (users, options, out) => deleteUserCommand(users, { email: 'bo@example.com', yes: true, ...options }, async () => '', out),
    'set-role': (users, options, out) => setRoleCommand(users, { email: 'bo@example.com', role: 'user', ...options }, out),
    disable: (users, options, out) => setDisabledCommand(users, { email: 'bo@example.com', disabled: true, ...options }, out),
    enable: (users, options, out) => setDisabledCommand(users, { email: 'bo@example.com', disabled: false, ...options }, out),
  }
  const changed = (users: UsersApi) => [users.deleteUser, users.setUserRole, users.setUserBanned].some((method) => vi.mocked(method).mock.calls.length > 0)

  for (const [name, run] of Object.entries(commands)) {
    describe(`users ${name}`, () => {
      it('reaches a member of the pinned organization, and prints it', async () => {
        const users = api(true)
        const out: string[] = []
        await run(users, {}, (t) => out.push(t))
        expect(out[0]).toBe('Organization: acme (Acme)\n')
        expect(changed(users)).toBe(true)
      })

      it('refuses someone outside the organization --organization names, changing nothing', async () => {
        const users = api(true)
        await expect(run(users, { organization: 'globex' }, () => {})).rejects.toThrow('bo@example.com is not a member of globex')
        expect(changed(users)).toBe(false)
      })

      it('reaches anyone with --all-organizations', async () => {
        const users = api(true)
        const out: string[] = []
        await run(users, { allOrganizations: true }, (t) => out.push(t))
        expect(out[0]).toBe('Every organization\n')
        expect(changed(users)).toBe(true)
      })
    })
  }
})
