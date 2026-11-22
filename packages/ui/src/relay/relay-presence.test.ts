import { describe, expect, it } from 'vitest'
import { isNewer, presenceFilter, presenceReport } from './relay-presence'

describe('presenceReport', () => {
  it('reads a presence_changed payload, and a record by its fields', () => {
    expect(presenceReport({ user: 'u1', status: 'offline', at: '2026-11-21T10:00:00.000Z' })).toEqual({ user: 'u1', status: 'offline', at: '2026-11-21T10:00:00.000Z' })
    expect(presenceReport({ user_id: 'u1', state: 'away', since: '2026-11-21T10:00:00.000Z' }, { user: 'user_id', status: 'state', at: 'since' })).toEqual({ user: 'u1', status: 'away', at: '2026-11-21T10:00:00.000Z' })
  })

  it('is nothing for another status or a missing field', () => {
    expect(presenceReport({ user: 'u1', status: 'busy', at: '2026-11-21T10:00:00.000Z' })).toBeUndefined()
    expect(presenceReport({ user: 'u1', status: 'online' })).toBeUndefined()
  })
})

describe('isNewer', () => {
  it('takes a report that began no earlier than the one known', () => {
    const known = { user: 'u1', status: 'online' as const, at: '2026-11-21T10:00:00.000Z' }
    expect(isNewer(undefined, known)).toBe(true)
    expect(isNewer(known, { ...known, status: 'offline', at: '2026-11-21T10:00:01.000Z' })).toBe(true)
    expect(isNewer(known, { ...known, status: 'offline', at: '2026-11-21T09:59:59.000Z' })).toBe(false)
  })
})

describe('presenceFilter', () => {
  it('asks for everyone in one in()', () => {
    expect(presenceFilter('user_id', ['u1', 'u"2'])).toBe('in(user_id, "u1", "u\\"2")')
  })
})
