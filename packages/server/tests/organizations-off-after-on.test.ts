import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CreateAuthOptions } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { testClock } from '../../../test-support/sql-snapshot'
import { authOn, mcpStores, password, serveMcp, type McpStores } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })

const prefix = 'test_'
// The auth template's default organization, which organizations made as they turned on.
const main = { id: 'default', name: 'Default', slug: 'default' }

const recordingMailer = () => {
  const sent: MailMessage[] = []
  const last = async (to: string) => {
    await expect.poll(() => sent.some((message) => message.to === to), { timeout: 10_000 }).toBe(true)
    return sent.findLast((message) => message.to === to)!.text
  }
  return { last, mailer: { send: async (message: MailMessage) => { sent.push(message); return {} } } }
}

// Organizations off after being on, pinned to the default organization.
const served = (auth: Partial<CreateAuthOptions> = {}) => serveMcp(stores, { auth: { personalAccessTokens: { prefix }, organizationsOff: { default: main, tenant: main.id }, ...auth }, tenant: main.id })

type Served = Awaited<ReturnType<typeof served>>

// Moves the person to an organization of their own, Acme, so they are no member of the default one.
const toAcme = async (app: Served, email: string) => {
  await app.store.query(`insert into organization (id, name, slug, created_at) values ('acme', 'Acme', 'acme', $1) on conflict (id) do nothing`, [testClock])
  await app.store.query(`update member set organization_id = 'acme' where user_id = $1`, [await app.userId(email)])
}

const signInWith = (app: Served, email: string, secret = password) => app.request('/api/auth/sign-in/email', { body: { email, password: secret } })

// The answer to a wrong password, which someone who is no member of the default organization gets too.
const wrongPassword = async (app: Served, email: string) => {
  const response = await signInWith(app, email, 'not the password')
  return { status: response.status, body: await response.json() }
}

const sessionsOf = async (app: Served, email: string) => (await app.store.query<{ count: number }>('select count(*)::int as count from session where user_id = $1', [await app.userId(email)])).rows[0]!.count

const api = (app: Served, token: string) => app.request('/api/v1/organizations?order_by=id&page_size=1', { headers: { authorization: `Bearer ${token}` } })

describe('the server, as organizations are off after being on', () => {
  it('pins the default organization only with authenticate.tenant its id, naming both otherwise', async () => {
    const store = await stores.migrated.clone()
    const pinnedBy = async (organizationsOff: CreateAuthOptions['organizationsOff']) => (await authOn(store, { organizationsOff })).pinnedOrganization()
    await expect(pinnedBy({ default: main })).rejects.toThrow('set authenticate.tenant to its id, "default", which is unset')
    await expect(pinnedBy({ default: main, tenant: 'acme' })).rejects.toThrow('"default", which is "acme"')
    await expect(pinnedBy({ tenant: 'default' })).rejects.toThrow('give auth.organizations.default the organization')
    expect(await pinnedBy({ default: main, tenant: main.id })).toEqual({ id: 'default' })
  })

  it('pins nothing on a store that holds no organization, as one that made their tables while they were off', async () => {
    const store = await stores.migrated.clone()
    await store.query('delete from organization')
    expect(await (await authOn(store, { organizationsOff: {} })).pinnedOrganization()).toBeUndefined()
    await store.query('drop table organization cascade')
    expect(await (await authOn(store, { organizationsOff: {} })).pinnedOrganization()).toBeUndefined()
  })
})

describe('signing in while organizations are off after being on', () => {
  it('takes a member of the default organization, and refuses anyone else as a wrong password, making no session', async () => {
    const app = await served()
    expect(await sessionsOf(app, 'ana@example.com')).toBe(0)
    await app.signIn('ana@example.com')
    await toAcme(app, 'bo@example.com')
    const refused = await signInWith(app, 'bo@example.com')
    expect({ status: refused.status, body: await refused.json() }).toEqual(await wrongPassword(app, 'bo@example.com'))
    expect(await sessionsOf(app, 'bo@example.com')).toBe(0)
  })

  it('refuses someone who is no member after a password reset, and by an emailed code', async () => {
    const { mailer, last } = recordingMailer()
    const app = await served({ mailer })
    await toAcme(app, 'bo@example.com')
    expect((await app.request('/api/auth/request-password-reset', { body: { email: 'bo@example.com', redirectTo: 'http://localhost:5173/' } })).status).toBe(200)
    const token = /reset-password\/([^?\s"]+)/.exec(await last('bo@example.com'))![1]!
    expect((await app.request('/api/auth/reset-password', { body: { newPassword: 'a new horse battery', token } })).status).toBe(200)
    const afterReset = await signInWith(app, 'bo@example.com', 'a new horse battery')
    expect({ status: afterReset.status, body: await afterReset.json() }).toEqual(await wrongPassword(app, 'bo@example.com'))

    expect((await app.request('/api/auth/email-otp/send-verification-otp', { body: { email: 'bo@example.com', type: 'sign-in' } })).status).toBe(200)
    const otp = /^\d{6}$/m.exec(await last('bo@example.com'))![0]
    const byCode = await app.request('/api/auth/sign-in/email-otp', { body: { email: 'bo@example.com', otp } })
    expect({ status: byCode.status, body: await byCode.json() }).toEqual(await wrongPassword(app, 'bo@example.com'))
    expect(await sessionsOf(app, 'bo@example.com')).toBe(0)
  })

  it('makes someone who joins a member of the default organization, with existingUsersRole, who then signs in', async () => {
    const app = await served({ organizationsOff: { default: main, existingUsersRole: 'sales', tenant: main.id } })
    await createUser(app.auth, { email: 'cy@example.com', password, role: 'sales' })
    const { rows } = await app.store.query<{ organization_id: string; role: string; app_roles: unknown }>('select organization_id, role, app_roles from member where user_id = $1', [await app.userId('cy@example.com')])
    expect(rows).toEqual([{ organization_id: 'default', role: 'member', app_roles: ['sales'] }])
    await app.signIn('cy@example.com')
  })
})

describe('sessions and tokens while organizations are off after being on', () => {
  it('end for someone no longer a member of the default organization, who gets no new token', async () => {
    const app = await served()
    const cookie = await app.signIn('ana@example.com')
    const { token } = (await (await app.request('/api/auth/token', { cookie })).json()) as { token: string }
    expect((await api(app, token)).status).toBe(200)
    await toAcme(app, 'ana@example.com')
    expect((await api(app, token)).status).toBe(401)
    expect((await app.request('/api/auth/token', { cookie })).status).toBe(401)
    expect((await app.request('/api/auth/account/personal-access-tokens/create', { cookie, body: { name: 'Script' } })).status).toBe(401)
  })

  it("keep an admin who is no member of the default organization from creating someone who would be", async () => {
    const app = await served()
    const cookie = await app.signIn('root@example.com')
    await toAcme(app, 'root@example.com')
    const created = await app.request('/api/auth/admin/create-user', { cookie, body: { email: 'cy@example.com', password, name: 'Cy', role: 'sales' } })
    expect(created.status).toBe(401)
    expect((await app.store.query('select id from "user" where email = $1', ['cy@example.com'])).rows).toEqual([])
  })

  it("make a personal access token in the default organization, which the account page does not name, and take only those", async () => {
    const app = await served()
    const cookie = await app.signIn('ana@example.com')
    const created = await app.request('/api/auth/account/personal-access-tokens/create', { cookie, body: { name: 'Weekly invoices' } })
    expect(created.status, await created.clone().text()).toBe(200)
    const { token, personalAccessToken } = (await created.json()) as { token: string; personalAccessToken: Record<string, unknown> }
    expect(personalAccessToken).not.toHaveProperty('organization')
    expect((await app.store.query('select organization_id from personal_access_token')).rows).toEqual([{ organization_id: 'default' }])
    expect((await api(app, token)).status).toBe(200)

    const unknown = await api(app, `${prefix}${'0'.repeat(46)}`)
    const unknownAnswer = { status: unknown.status, body: await unknown.text() }
    await app.store.query(`insert into organization (id, name, slug, created_at) values ('acme', 'Acme', 'acme', $1)`, [testClock])
    await app.store.query(`update personal_access_token set organization_id = 'acme'`)
    const other = await api(app, token)
    expect({ status: other.status, body: await other.text() }).toEqual(unknownAnswer)
    expect(unknownAnswer.status).toBe(401)
  })

  it("end a personal access token of the default organization once its user is no member there", async () => {
    const app = await served()
    const cookie = await app.signIn('ana@example.com')
    const { token } = (await (await app.request('/api/auth/account/personal-access-tokens/create', { cookie, body: { name: 'Script' } })).json()) as { token: string }
    await toAcme(app, 'ana@example.com')
    expect((await api(app, token)).status).toBe(401)
  })
})
