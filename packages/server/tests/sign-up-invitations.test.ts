import { describe, expect, it, vi } from 'vitest'
import { createOrganization } from '../src/better-auth/organizations/host'
import { password, signUpServer } from './support/sign-up-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const { serve } = signUpServer()

const signUp = { role: 'member' }

describe('open sign-up and a pending invitation to the app', () => {
  // Invitation, code and account: the whole flow, longer than one request on a busy runner.
  it('makes the account of an invited address through the invitation: its roles, and the invitation used up', async () => {
    const { request, invite, invitations, ticketFor, userOf } = await serve({ signUp })
    await invite('nia@example.com', ['editor'])
    const created = await request('/sign-up/create', { body: { ticket: await ticketFor('nia@example.com'), name: 'Nia', password } })
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({ user: { email: 'nia@example.com', name: 'Nia', role: 'editor' } })
    expect(await userOf('nia@example.com')).toMatchObject({ role: 'editor', emailVerified: true })
    expect(await invitations()).toEqual([])
  }, 20_000)

  it('makes a plain account with the sign-up role once the invitation was revoked', async () => {
    const { request, invite, rootCookie, ticketFor, userOf } = await serve({ signUp })
    const id = await invite('nia@example.com', ['editor'])
    expect((await request('/users/invitations/cancel', { cookie: await rootCookie(), body: { id } })).status).toBe(200)
    expect((await request('/sign-up/create', { body: { ticket: await ticketFor('nia@example.com'), name: 'Nia', password } })).status).toBe(200)
    expect(await userOf('nia@example.com')).toMatchObject({ role: 'member' })
  }, 20_000)

  it('makes a plain account with the sign-up role once the invitation expired', async () => {
    const { request, invite, ticketFor, userOf } = await serve({ signUp })
    await invite('nia@example.com', ['editor'])
    vi.useFakeTimers({ now: Date.now() + 8 * 24 * 60 * 60 * 1000, toFake: ['Date'] })
    try {
      expect((await request('/sign-up/create', { body: { ticket: await ticketFor('nia@example.com'), name: 'Nia', password } })).status).toBe(200)
      expect(await userOf('nia@example.com')).toMatchObject({ role: 'member' })
    } finally {
      vi.useRealTimers()
    }
  }, 20_000)
})

describe('a pending invitation to an organization', () => {
  // Organizations, the invitation and the link's sign-up: longer than one request on a busy runner.
  it('makes no account from the emailed sign-in code, and the invitation link still makes it', async () => {
    const { auth, sent, request, rootCookie, askSignInCode, signInWithCode, userOf } = await serve({ organizations: {}, roles: { editor: 'Editor' }, defaultRole: undefined })
    await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'root@example.com' })
    const before = sent.length
    const invited = await request('/organization/invite-member', { cookie: await rootCookie(), body: { email: 'nia@example.com', role: 'member' } })
    expect(invited.status).toBe(200)
    await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(before)
    const token = decodeURIComponent(/token=(\S+)/.exec(sent.at(-1)!.text)![1]!)

    await askSignInCode('nia@example.com')
    expect(sent.at(-1)).toMatchObject({ to: 'nia@example.com', subject: 'No Protobase account uses this address' })
    expect((await signInWithCode('nia@example.com', '123456')).status).toBe(400)
    expect(await userOf('nia@example.com')).toBeUndefined()

    expect((await request(`/invitation?token=${encodeURIComponent(token)}`)).status).toBe(200)
    expect((await request('/invitation/sign-up', { body: { token, name: 'Nia', password } })).status).toBe(200)
    expect(await userOf('nia@example.com')).toBeDefined()
  }, 30_000)
})
