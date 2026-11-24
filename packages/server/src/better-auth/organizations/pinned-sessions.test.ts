import { describe, expect, it } from 'vitest'
import { pinnedSessionHooks } from './pinned-sessions'
import type { AuthContext } from './store'

// The store with the members and users the hooks read, each found by every field the lookup names.
const contextWith = (members: Record<string, unknown>[], users: { id: string; email: string }[]) => {
  const created: Record<string, unknown>[] = []
  const findOne = async ({ where }: { where: { field: string; value: unknown }[] }) => [...members, ...created].find((row) => where.every(({ field, value }) => row[field] === value)) ?? null
  const create = async ({ data }: { data: Record<string, unknown> }) => (created.push(data), data)
  const context = { adapter: { findOne, create }, internalAdapter: { findUserById: async (id: string) => users.find((user) => user.id === id) ?? null } } as unknown as AuthContext
  return { created, context: async () => context }
}

const pin = async () => ({ id: 'main', existingUsersRole: 'sales' })

describe('sign-in while organizations are off after being on', () => {
  it('makes a session for a member of the pinned organization, and refuses anyone else as a wrong password', async () => {
    const { context } = contextWith([{ organizationId: 'main', userId: 'ana' }, { organizationId: 'acme', userId: 'bo' }], [{ id: 'bo', email: 'bo@example.com' }])
    const hooks = pinnedSessionHooks(pin, context)
    await expect(hooks.session({ userId: 'ana' }, {})).resolves.toBeUndefined()
    await expect(hooks.session({ userId: 'bo' }, {})).rejects.toMatchObject({ statusCode: 401, body: { code: 'INVALID_EMAIL_OR_PASSWORD' } })
  })

  it('makes one for a user the same request created, who joins once their row is committed, and for no one another request created', async () => {
    const { context, created } = contextWith([], [{ id: 'cy', email: 'cy@example.com' }])
    const hooks = pinnedSessionHooks(pin, context)
    const signUp = {}
    await hooks.user.before({ email: 'Cy@example.com' }, signUp)
    await expect(hooks.session({ userId: 'cy' }, {})).rejects.toMatchObject({ statusCode: 401 })
    await expect(hooks.session({ userId: 'cy' }, signUp)).resolves.toBeUndefined()
    await hooks.user.after({ id: 'cy' })
    expect(created).toEqual([{ organizationId: 'main', userId: 'cy', role: 'member', createdAt: expect.any(Date), appRoles: ['sales'] }])
  })

  it('checks nothing while no organization is pinned', async () => {
    const { context, created } = contextWith([], [])
    const hooks = pinnedSessionHooks(async () => undefined, context)
    await expect(hooks.session({ userId: 'bo' }, {})).resolves.toBeUndefined()
    await hooks.user.after({ id: 'bo' })
    expect(created).toEqual([])
  })
})
