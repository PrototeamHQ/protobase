import { describe, expect, it, vi } from 'vitest'
import { browser, origin, password, serve } from './support/notifications-app'
import { describedAs, expectLeft, recordingMailer, signedIn } from './support/session-end'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

describe(describedAs, () => {
  it("keeps the calling browser's device and removes the others' when the user revokes their other sessions", async () => {
    const served = await serve()
    const { second } = await signedIn(served)
    expect((await served.post('/api/auth/revoke-other-sessions', {}, { cookie: second })).status).toBe(200)
    await expectLeft(served, ['alice-2'])
  })

  it('gets no push and is removed when a password reset ends the sessions', async () => {
    const { mailer, last } = recordingMailer()
    const served = await serve({ mailer })
    await signedIn(served)
    expect((await served.post('/api/auth/request-password-reset', { email: 'alice@example.com', redirectTo: `${origin}/` })).status).toBe(200)
    const token = /reset-password\/([^?\s"]+)/.exec(await last('alice@example.com'))![1]!
    expect((await served.post('/api/auth/reset-password', { newPassword: `${password} again`, token })).status).toBe(200)
    await expectLeft(served, [])
  })
})
