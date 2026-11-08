import { describe, expect, it, vi } from 'vitest'
import { browser, serve } from './support/notifications-app'
import { describedAs, expectLeft, signedIn, tokenIn } from './support/session-end'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

describe(describedAs, () => {
  it('gets no push and is removed when it has no session recorded, as one registered before devices kept theirs', async () => {
    const served = await serve()
    await signedIn(served)
    await served.pg.query(`update notifications.devices set session_id = null where token like '%/alice-1'`)
    await expectLeft(served, ['alice-2'])
  })

  it('gets push again once its user signs in again and the browser registers it in the new session', async () => {
    const served = await serve()
    const { first, bearerOf } = await signedIn(served)
    expect((await served.post('/api/auth/sign-out', {}, { cookie: first })).status).toBe(200)
    await expectLeft(served, ['alice-2'])
    const again = await served.cookieOf('alice@example.com')
    expect((await served.register(await bearerOf(again), browser('alice-1'))).status).toBe(200)
    await expectLeft(served, ['alice-1', 'alice-2'])
    const { rows } = await served.pg.query(`select s.token from notifications.devices d join "session" s on s.id = d.session_id where d.token like '%/alice-1'`)
    expect(rows).toEqual([{ token: tokenIn(again) }])
  })
})
