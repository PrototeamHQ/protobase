import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it } from 'vitest'
import { betterAuthOptions, type CreateAuthOptions } from './create-auth'
import { readLockedAccounts } from './locked-accounts'
import { roleDefinitions } from './organizations/role-definitions'

const base: CreateAuthOptions = { database: undefined, baseURL: 'https://admin.example.com', secret: 'test-secret-test-secret-test-secret-1234' }
const resolved = { roles: ['admin', 'user'], definitions: roleDefinitions(), defaultRole: 'user', lockedAccounts: ['demo@example.com'] }
const password = 'correct horse battery'
const newPassword = 'another horse battery'

// Better Auth with Protobase's options on a store in memory, whose rows have the store's snake_case columns, with a
// locked demo account, another user and an admin.
const setUp = async () => {
  const store: Record<string, Record<string, unknown>[]> = { user: [], account: [], session: [], verification: [], two_factor: [], passkey: [], sign_in_policy: [], jwks: [] }
  const auth = betterAuth({ ...betterAuthOptions(base, resolved), database: memoryAdapter(store) })
  const create = (email: string, role: string) => auth.api.createUser({ body: { email, password, name: email, role: role as 'user' } })
  const demo = (await create('Demo@Example.com', 'admin')).user
  const other = (await create('other@example.com', 'user')).user
  await create('root@example.com', 'admin')
  const signIn = async (email: string, secret = password) => (await auth.api.signInEmail({ body: { email, password: secret }, returnHeaders: true })).headers
  const cookie = async (email: string) => new Headers({ cookie: (await signIn(email)).getSetCookie().map((line) => line.split(';')[0]).join('; ') })
  return { auth, store, demo, other, signIn, headers: { demo: await cookie('demo@example.com'), other: await cookie('other@example.com'), root: await cookie('root@example.com') } }
}

const locked = expect.objectContaining({ body: expect.objectContaining({ code: 'ACCOUNT_LOCKED' }) })

describe('readLockedAccounts', () => {
  it('reads the comma separated addresses in lower case, without blanks or repeats', () => {
    expect(readLockedAccounts({ PROTOBASE_LOCKED_ACCOUNTS: ' Demo@Example.com, ,demo@example.com,b@example.com ' })).toEqual(['demo@example.com', 'b@example.com'])
    expect(readLockedAccounts({})).toEqual([])
  })
})

describe('a locked account', () => {
  it('keeps its password, from its own session and from an admin', async () => {
    const { auth, demo, headers, signIn } = await setUp()
    await expect(auth.api.changePassword({ body: { currentPassword: password, newPassword }, headers: headers.demo })).rejects.toEqual(locked)
    await expect(auth.api.setUserPassword({ body: { userId: demo.id, newPassword }, headers: headers.root })).rejects.toEqual(locked)
    expect((await signIn('demo@example.com')).getSetCookie()).not.toHaveLength(0)
  })

  it('keeps its address and cannot be deleted', async () => {
    const { auth, store, demo, headers } = await setUp()
    await expect(auth.api.adminUpdateUser({ body: { userId: demo.id, data: { email: 'mine@example.com' } }, headers: headers.root })).rejects.toEqual(locked)
    await expect(auth.api.removeUser({ body: { userId: demo.id }, headers: headers.root })).rejects.toEqual(locked)
    expect(store.user!.find((user) => user.id === demo.id)).toMatchObject({ email: 'demo@example.com' })
    expect(store.account!.filter((account) => account.user_id === demo.id)).toHaveLength(1)
  })

  it('cannot turn on two-factor authentication or change its passkeys', async () => {
    const { auth, store, demo, headers } = await setUp()
    await expect(auth.api.enableTwoFactor({ body: { password }, headers: headers.demo })).rejects.toEqual(locked)
    expect(store.two_factor).toHaveLength(0)
    store.passkey!.push({ id: 'passkey-1', user_id: demo.id, name: 'Laptop', public_key: 'key', credential_id: 'credential', counter: 0, device_type: 'singleDevice', backed_up: false, created_at: new Date() })
    await expect(auth.api.deletePasskey({ body: { id: 'passkey-1' }, headers: headers.demo })).rejects.toEqual(locked)
    await expect(auth.api.updatePasskey({ body: { id: 'passkey-1', name: 'Mine' }, headers: headers.demo })).rejects.toEqual(locked)
    expect(store.passkey).toEqual([expect.objectContaining({ id: 'passkey-1', name: 'Laptop' })])
  })

  it('still changes its name, and other accounts change everything', async () => {
    const { auth, store, demo, other, headers, signIn } = await setUp()
    await auth.api.updateUser({ body: { name: 'Demo' }, headers: headers.demo })
    expect(store.user!.find((user) => user.id === demo.id)).toMatchObject({ name: 'Demo' })
    await auth.api.changePassword({ body: { currentPassword: password, newPassword }, headers: headers.other })
    expect((await signIn('other@example.com', newPassword)).getSetCookie()).not.toHaveLength(0)
    await auth.api.removeUser({ body: { userId: other.id }, headers: headers.root })
    expect(store.user!.map((user) => user.email)).not.toContain('other@example.com')
  })
})
