import { describe, expect, it, vi } from 'vitest'
import { setUserBanned } from '../src/better-auth/users'
import { serve } from './support/notifications-app'
import { describedAs, expectLeft, signedIn } from './support/session-end'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

describe(describedAs, () => {
  it('gets no push and is removed when an admin bans the user, from the CLI and over HTTP', async () => {
    const byCli = await serve()
    await signedIn(byCli)
    await setUserBanned(byCli.auth, { email: 'alice@example.com', banned: true })
    await expectLeft(byCli, [])

    const byHttp = await serve()
    await signedIn(byHttp)
    const admin = await byHttp.cookieOf('root@example.com')
    expect((await byHttp.post('/api/auth/admin/ban-user', { userId: byHttp.alice.id }, { cookie: admin })).status).toBe(200)
    await expectLeft(byHttp, [])
  })
})
