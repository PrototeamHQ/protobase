import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it } from 'vitest'
import { betterAuthOptions, type CreateAuthOptions } from './create-auth'
import { roleDefinitions } from './organizations/role-definitions'
import { userDeletion } from './user-deletion'

const base: CreateAuthOptions = { database: undefined, baseURL: 'https://admin.example.com', secret: 'test-secret-test-secret-test-secret-1234' }
const password = 'correct horse battery'

// Better Auth with Protobase's options on a store in memory, with a locked demo account, a user and one admin.
const setUp = async (options: Partial<CreateAuthOptions> = {}) => {
  const store: Record<string, Record<string, unknown>[]> = { user: [], account: [], session: [], verification: [], two_factor: [], passkey: [], sign_in_policy: [], jwks: [] }
  const deletion = userDeletion()
  const deleted: string[] = []
  deletion.set('test', async (userId) => void deleted.push(userId))
  let instance: { $context: Promise<{ adapter: never }> } | undefined
  const context = () => instance!.$context
  const resolved = { roles: ['admin', 'user'], definitions: roleDefinitions(), defaultRole: 'user', lockedAccounts: ['demo@example.com'], deletion, context: context as never }
  const auth = betterAuth({ ...betterAuthOptions({ ...base, ...options }, resolved), database: memoryAdapter(store) })
  instance = auth as never
  const create = async (email: string, role: string) => (await auth.api.createUser({ body: { email, password, name: email, role: role as 'user' } })).user
  const users = { demo: await create('demo@example.com', 'user'), ana: await create('ana@example.com', 'user'), root: await create('root@example.com', 'admin') }
  const signIn = (email: string) => auth.api.signInEmail({ body: { email, password }, returnHeaders: true })
  const headersOf = async (email: string) => new Headers({ cookie: (await signIn(email)).headers.getSetCookie().map((line) => line.split(';')[0]).join('; ') })
  return { auth, store, users, deleted, signIn, headersOf }
}

const failedWith = (code: string) => expect.objectContaining({ body: expect.objectContaining({ code }) })

describe('deleting your own account', () => {
  it('is on by default: the account goes with its sessions and sign-in, and the cookie is cleared', async () => {
    const { auth, store, users, deleted, signIn, headersOf } = await setUp()
    const headers = await headersOf('ana@example.com')
    await headersOf('ana@example.com')
    const answer = await auth.api.deleteUser({ body: { password }, headers, returnHeaders: true })
    expect(answer.response).toEqual({ success: true, message: 'User deleted' })
    expect(answer.headers.getSetCookie().some((line) => line.includes('session_token=;'))).toBe(true)
    expect(store.user!.some((user) => user.id === users.ana.id)).toBe(false)
    expect(store.account!.some((account) => account.user_id === users.ana.id)).toBe(false)
    expect(store.session!.some((session) => session.user_id === users.ana.id)).toBe(false)
    expect(deleted).toEqual([users.ana.id, users.ana.id])
    await expect(signIn('ana@example.com')).rejects.toEqual(failedWith('INVALID_EMAIL_OR_PASSWORD'))
  })

  it('needs no password from a session that signed in just now', async () => {
    const { auth, store, users, headersOf } = await setUp()
    await auth.api.deleteUser({ body: {}, headers: await headersOf('ana@example.com') })
    expect(store.user!.some((user) => user.id === users.ana.id)).toBe(false)
  })

  it('refuses a wrong password before anything is deleted', async () => {
    const { auth, store, users, deleted, headersOf } = await setUp()
    await expect(auth.api.deleteUser({ body: { password: 'not the password' }, headers: await headersOf('ana@example.com') })).rejects.toEqual(failedWith('INVALID_PASSWORD'))
    expect(store.user!.some((user) => user.id === users.ana.id)).toBe(true)
    expect(deleted).toEqual([])
  })

  it('is refused for the last active admin, and allowed once there is another', async () => {
    const { auth, store, users, deleted, headersOf } = await setUp()
    const headers = await headersOf('root@example.com')
    await expect(auth.api.deleteUser({ body: { password }, headers })).rejects.toEqual(failedWith('LAST_ADMIN'))
    expect(store.user!.some((user) => user.id === users.root.id)).toBe(true)
    expect(deleted).toEqual([])
    await auth.api.setRole({ body: { userId: users.ana.id, role: 'admin' }, headers })
    await auth.api.deleteUser({ body: { password }, headers })
    expect(store.user!.some((user) => user.id === users.root.id)).toBe(false)
  })

  it('is refused for a locked account, which keeps its sessions', async () => {
    const { auth, store, users, deleted, headersOf } = await setUp()
    await expect(auth.api.deleteUser({ body: { password }, headers: await headersOf('demo@example.com') })).rejects.toEqual(failedWith('ACCOUNT_LOCKED'))
    expect(store.user!.some((user) => user.id === users.demo.id)).toBe(true)
    expect(store.session!.some((session) => session.user_id === users.demo.id)).toBe(true)
    expect(deleted).toEqual([])
  })

  it('is refused with `accountDeletion: false`, where the same request deletes the account by default', async () => {
    const request = async ({ auth, headersOf }: Awaited<ReturnType<typeof setUp>>) => {
      const cookie = (await headersOf('ana@example.com')).get('cookie')!
      return auth.handler(new Request(`${base.baseURL}/api/auth/delete-user`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', origin: base.baseURL }, body: JSON.stringify({ password }) }))
    }
    const off = await setUp({ accountDeletion: false })
    expect((await request(off)).status).toBe(404)
    expect(off.store.user!.some((user) => user.id === off.users.ana.id)).toBe(true)
    expect((await request(await setUp())).status).toBe(200)
  })

  it('has no emailed confirmation link', async () => {
    const { auth } = await setUp()
    expect((await auth.handler(new Request(`${base.baseURL}/api/auth/delete-user/callback?token=x`))).status).toBe(404)
  })
})
