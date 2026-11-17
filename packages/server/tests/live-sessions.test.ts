import { describe, expect, it } from 'vitest'
import { createAuth } from '../src/better-auth/create-auth'
import { liveSessionsIn } from '../src/better-auth/live-sessions'
import type { AuthContext } from '../src/better-auth/organizations/store'
import { storeSqlOf } from '../src/better-auth/store/store-sql'
import { openSnapshotDb, settled } from '../../../test-support/sql-snapshot'

const now = new Date('2026-08-01T12:00:00Z')

// A store with users and their sessions written straight in: `sessions` names each one's id, user and end.
const storeWith = async (users: string, sessions: string) => {
  const store = await openSnapshotDb('auth')
  const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: 'http://localhost:5173', secret: 'test-secret-test-secret-test-secret-1234', mailer: false })
  // Its schema check, which starts once its context is made, finishes before the test's queries.
  const context = (await auth.$context) as unknown as AuthContext
  await settled()
  await store.exec(`insert into "user" (id, name, email, email_verified, banned, ban_expires, created_at, updated_at)
    select id, id, id || '@example.com', true, banned, ban_expires, now(), now() from (values ${users}) as u (id, banned, ban_expires);
  insert into session (id, user_id, token, expires_at, updated_at)
    select id, user_id, 'token-' || id, expires_at, now() from (values ${sessions}) as s (id, user_id, expires_at)`)
  return storeSqlOf(context)
}

describe('liveSessionsIn', () => {
  it('answers the sessions that stand with their users, leaving out gone and expired ones', async () => {
    const store = await storeWith(
      `('alice', false, null::timestamptz), ('bob', false, null)`,
      `('s1', 'alice', timestamptz '2026-08-02 12:00:00+00'), ('s2', 'bob', timestamptz '2026-08-01 12:00:00+00')`,
    )
    expect([...(await liveSessionsIn(store, ['s1', 's2', 'gone'], now))]).toEqual([['s1', 'alice']])
  })

  it("leaves out a banned user's session the ban left standing, until the ban ends", async () => {
    const store = await storeWith(
      `('alice', true, null::timestamptz), ('bob', true, timestamptz '2026-08-02 12:00:00+00'), ('carol', true, timestamptz '2026-08-01 12:00:00+00')`,
      `('s1', 'alice', timestamptz '2026-08-02 12:00:00+00'), ('s2', 'bob', timestamptz '2026-08-02 12:00:00+00'), ('s3', 'carol', timestamptz '2026-08-02 12:00:00+00')`,
    )
    expect([...(await liveSessionsIn(store, ['s1', 's2', 's3'], now))]).toEqual([['s3', 'carol']])
  })

  it('answers every one of 150 standing sessions of 150 users, past the 100 rows a read returns untold', async () => {
    const store = await storeWith(
      `${Array.from({ length: 150 }, (_, i) => `('u${i}', false, null::timestamptz)`).join(', ')}`,
      `${Array.from({ length: 150 }, (_, i) => `('s${i}', 'u${i}', timestamptz '2026-08-02 12:00:00+00')`).join(', ')}`,
    )
    const live = await liveSessionsIn(store, Array.from({ length: 150 }, (_, i) => `s${i}`), now)
    expect(live.size).toBe(150)
    expect(live.get('s149')).toBe('u149')
  })

  it('asks the store nothing for no ids', async () => {
    const store = { db: { executeQuery: () => Promise.reject(new Error('asked')) } } as never
    expect((await liveSessionsIn(store, [], now)).size).toBe(0)
  })
})
