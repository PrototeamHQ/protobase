import { describe, expect, it } from 'vitest'
import { liveSessionsIn } from './live-sessions'
import { fakeAdapter } from './testing/fake-adapter'

const now = new Date('2026-08-01T12:00:00Z')
const later = new Date('2026-08-02T12:00:00Z')
const users = ['alice', 'bob', 'carol'].map((id) => ({ id, banned: false, banExpires: null }))

describe('liveSessionsIn', () => {
  it('answers the sessions that stand with their users, leaving out gone and expired ones', async () => {
    const { adapter } = fakeAdapter({
      session: [
        { id: 's1', userId: 'alice', token: 'secret-1', expiresAt: later },
        { id: 's2', userId: 'bob', token: 'secret-2', expiresAt: now },
        { id: 's3', userId: 'carol', token: 'secret-3', expiresAt: later },
      ],
      user: users,
    })
    const live = await liveSessionsIn({ adapter }, ['s1', 's2', 'gone'], now)
    expect([...live]).toEqual([['s1', 'alice']])
  })

  it("leaves out a banned user's session the ban left standing, until the ban ends", async () => {
    const { adapter } = fakeAdapter({
      session: [
        { id: 's1', userId: 'alice', token: 'secret-1', expiresAt: later },
        { id: 's2', userId: 'bob', token: 'secret-2', expiresAt: later },
        { id: 's3', userId: 'carol', token: 'secret-3', expiresAt: later },
      ],
      user: [
        { id: 'alice', banned: true, banExpires: null },
        { id: 'bob', banned: true, banExpires: later },
        { id: 'carol', banned: true, banExpires: now },
      ],
    })
    const live = await liveSessionsIn({ adapter }, ['s1', 's2', 's3'], now)
    expect([...live]).toEqual([['s3', 'carol']])
  })

  it('leaves out a session whose user is gone', async () => {
    const { adapter } = fakeAdapter({ session: [{ id: 's1', userId: 'alice', token: 'secret-1', expiresAt: later }], user: [] })
    expect((await liveSessionsIn({ adapter }, ['s1'], now)).size).toBe(0)
  })

  it('asks the store nothing for no ids, and for no users when no session stands', async () => {
    const adapter = { findMany: () => Promise.reject(new Error('asked')) } as never
    expect((await liveSessionsIn({ adapter }, [], now)).size).toBe(0)
    const models: string[] = []
    const sessionsOnly = { findMany: async ({ model }: { model: string }) => (models.push(model), []) } as never
    expect((await liveSessionsIn({ adapter: sessionsOnly }, ['s1'], now)).size).toBe(0)
    expect(models).toEqual(['session'])
  })

  it('throws when the users cannot be read, so no session counts as standing', async () => {
    const adapter = { findMany: async ({ model }: { model: string }) => (model === 'user' ? Promise.reject(new Error('down')) : [{ id: 's1', userId: 'alice', expiresAt: later }]) } as never
    await expect(liveSessionsIn({ adapter }, ['s1'], now)).rejects.toThrow('down')
  })
})
