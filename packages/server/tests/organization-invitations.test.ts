import { describe, expect, it, vi } from 'vitest'
import { setMemberRoles } from '../src/better-auth/organizations/host'
import { claimsOf, invitationIdFrom, organizationsApp, password } from './support/organizations-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const { serve } = organizationsApp()

describe('inviting people', () => {
  it('gives the inviter the link without a mailer, and makes an account for a new address from it', async () => {
    const app = await serve({}, { people: true })
    const bo = await app.signIn('bo@example.com')
    const invited = await app.request('/api/auth/organization/invite-member', { cookie: bo, body: { email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'] } })
    expect(invited.status).toBe(200)
    const { link } = (await invited.json()) as { link: string }
    expect(link).toMatch(/^http:\/\/localhost:5173\/-\/invitation\?token=/)
    const token = decodeURIComponent(new URL(link).searchParams.get('token')!)

    const preview = await (await app.request(`/api/auth/invitation?token=${encodeURIComponent(token)}`)).json()
    expect(preview).toMatchObject({ organization: { id: '1', name: 'Acme' }, inviter: { name: 'bo' }, email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'], hasAccount: false })
    expect((await app.request(`/api/auth/invitation?token=${encodeURIComponent(token.slice(0, -2))}`)).status).toBe(400)

    const signedUp = await app.request('/api/auth/invitation/sign-up', { body: { token, name: 'Jan', password } })
    expect(signedUp.status).toBe(200)
    const jan = signedUp.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    expect(await claimsOf(app, jan)).toMatchObject({ role: 'user', org: '1', org_role: 'member', app_roles: ['accountant'] })
    // The link works once
    expect((await app.request('/api/auth/invitation/sign-up', { body: { token, name: 'Jan', password } })).status).toBe(400)
    expect(await app.signIn('jan@ledger.example')).toContain('session_token')
  })

  it('emails the link with a mailer, and leaves it out of the answer', async () => {
    const sent: { to: string; subject: string; text: string }[] = []
    const app = await serve({ mailer: { send: async (message) => { sent.push(message); return {} } } }, { people: true })
    const answer = await (await app.request('/api/auth/organization/invite-member', { cookie: await app.signIn('bo@example.com'), body: { email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'] } })).json()
    expect(answer).not.toHaveProperty('link')
    // Mail goes out after the answer
    await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1)
    expect(sent[0]).toMatchObject({ to: 'jan@ledger.example', subject: 'Join Acme on Protobase', text: expect.stringContaining('http://localhost:5173/-/invitation?token=') })
    const token = decodeURIComponent(/token=(\S+)/.exec(sent[0]!.text)![1]!)
    expect((await app.request(`/api/auth/invitation?token=${encodeURIComponent(token)}`)).status).toBe(200)
  })

  it('lets someone with an account accept signed in as the invited address only', async () => {
    const app = await serve({}, { people: true })
    const bo = await app.signIn('bo@example.com')
    const { link } = (await (await app.request('/api/auth/organization/invite-member', { cookie: bo, body: { email: 'ana@example.com', role: 'member', appRoles: ['sales'] } })).json()) as { link: string }
    const token = new URL(link).searchParams.get('token')!
    expect((await app.request('/api/auth/invitation/sign-up', { body: { token, name: 'Ana', password } })).status).toBe(400)
    expect(await (await app.request('/api/auth/invitation/accept', { cookie: await app.signIn('sanne@example.com'), body: { token } })).json()).toMatchObject({ code: 'NOT_THE_INVITED_ADDRESS' })
    const ana = await app.signIn('ana@example.com')
    expect((await app.request('/api/auth/invitation/accept', { cookie: ana, body: { token } })).status).toBe(200)
    // Her first role is the global support; the membership's sales is one to switch to.
    expect(await claimsOf(app, ana)).toMatchObject({ role: 'support', org: '1', org_role: 'member', app_roles: [] })
    expect((await app.request('/api/auth/organization/accept-invitation', { cookie: ana, body: { invitationId: invitationIdFrom(token) } })).status).toBe(404)
  })

  it('refuses app roles the inviter neither holds nor is granted by a role they hold', async () => {
    const app = await serve({}, { people: true })
    await setMemberRoles(app.auth, { organization: 'acme', email: 'sanne@example.com', role: 'admin', appRoles: ['sales'] })
    const sanne = await app.signIn('sanne@example.com')
    const invite = (appRoles: string[], email = 'kim@example.com') => app.request('/api/auth/organization/invite-member', { cookie: sanne, body: { email, role: 'member', appRoles } })
    expect(await (await invite(['accountant'])).json()).toMatchObject({ code: 'APP_ROLE_NOT_GRANTABLE' })
    expect((await invite(['sales'])).status).toBe(200)
    // manager grants accountant
    await setMemberRoles(app.auth, { organization: 'acme', email: 'sanne@example.com', appRoles: ['manager'] })
    expect((await invite(['accountant'], 'lou@example.com')).status).toBe(200)
  })
})
