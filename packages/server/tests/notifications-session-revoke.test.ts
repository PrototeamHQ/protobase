import { describe, expect, it, vi } from 'vitest'
import { browser, serve } from './support/notifications-app'
import { describedAs, expectLeft, signedIn, tokenIn } from './support/session-end'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

describe(describedAs, () => {
  it('gets no push and is removed when that one session is revoked, the other browser kept', async () => {
    const served = await serve()
    const { first, second } = await signedIn(served)
    expect((await served.post('/api/auth/revoke-session', { token: tokenIn(first) }, { cookie: second })).status).toBe(200)
    await expectLeft(served, ['alice-2'])
  })

  it('gets no push and is removed when the user revokes all their sessions', async () => {
    const served = await serve()
    const { first } = await signedIn(served)
    expect((await served.post('/api/auth/revoke-sessions', {}, { cookie: first })).status).toBe(200)
    await expectLeft(served, [])
  })
})
