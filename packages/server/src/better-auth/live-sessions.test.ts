import { describe, expect, it } from 'vitest'
import { liveSessionsIn } from './live-sessions'
import { fakeAdapter } from './testing/fake-adapter'

const now = new Date('2026-08-01T12:00:00Z')
const later = new Date('2026-08-02T12:00:00Z')

describe('liveSessionsIn', () => {
  it('answers the sessions that stand with their users, leaving out gone and expired ones', async () => {
    const { adapter } = fakeAdapter({
      session: [
        { id: 's1', userId: 'alice', token: 'secret-1', expiresAt: later },
        { id: 's2', userId: 'bob', token: 'secret-2', expiresAt: now },
        { id: 's3', userId: 'carol', token: 'secret-3', expiresAt: later },
      ],
    })
    const live = await liveSessionsIn({ adapter }, ['s1', 's2', 'gone'], now)
    expect([...live]).toEqual([['s1', 'alice']])
  })

  it('asks the store nothing for no ids', async () => {
    const adapter = { findMany: () => Promise.reject(new Error('asked')) } as never
    expect((await liveSessionsIn({ adapter }, [], now)).size).toBe(0)
  })
})
