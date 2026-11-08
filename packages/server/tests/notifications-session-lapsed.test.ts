import { describe, expect, it, vi } from 'vitest'
import { serve } from './support/notifications-app'
import { describedAs, expectLeft, signedIn, tokenIn } from './support/session-end'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

describe(describedAs, () => {
  it('gets no push and is removed when the user is banned without their sessions ending', async () => {
    const served = await serve()
    await signedIn(served)
    // Every ban endpoint also deletes the sessions, so the ban is written straight to the user row to leave them standing.
    await served.pg.query('update "user" set banned = true where id = $1', [served.alice.id])
    expect((await served.pg.query('select count(*)::int as count from "session" where user_id = $1', [served.alice.id])).rows).toEqual([{ count: 2 }])
    await expectLeft(served, [])
  })

  it('gets no push and is removed once the session expires, while its row still stands', async () => {
    const served = await serve()
    const { first } = await signedIn(served)
    await served.pg.query(`update "session" set expires_at = '2026-07-01T00:00:00Z' where token = $1`, [tokenIn(first)])
    await expectLeft(served, ['alice-2'])
  })
})
