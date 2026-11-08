import { describe, expect, it, vi } from 'vitest'
import { fcm, pushTo, serve } from './support/notifications-app'
import { describedAs, signedIn } from './support/session-end'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

describe(describedAs, () => {
  it("follows a phone's token to whoever registers it last, and ends only with that user's session", async () => {
    const served = await serve()
    const { first, bobs, bearerOf } = await signedIn(served)
    expect((await served.register(await bearerOf(first), fcm('shared-phone'))).status).toBe(200)
    expect((await served.register(await bearerOf(bobs), fcm('shared-phone'))).status).toBe(200)
    expect(await pushTo(served, served.alice.id)).toEqual(['alice-1', 'alice-2'])
    expect((await served.post('/api/auth/sign-out', {}, { cookie: first })).status).toBe(200)
    expect(await pushTo(served, served.alice.id)).toEqual(['alice-2'])
    expect(await pushTo(served, served.bob.id)).toEqual(['bob-1', 'shared-phone'])
  })
})
