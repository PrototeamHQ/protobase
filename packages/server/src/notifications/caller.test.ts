import { describe, expect, it } from 'vitest'
import type { Session } from '../types'
import { ownDeviceUser } from './caller'

const own: Session = { user: { id: 'a', roles: ['user'] }, signIn: { session: 's1', staff: false } }

describe('ownDeviceUser', () => {
  it("is the user of someone signed in as themselves, as text", () => {
    expect(ownDeviceUser(own)).toBe('a')
    expect(ownDeviceUser({ ...own, user: { id: 7, roles: [] }, signIn: { staff: false } })).toBe('7')
  })

  it.each([
    ['a visitor', { ...own, anonymous: true as const }],
    ['an outside app acting for the user', { ...own, client: { id: 'mcp', scopes: [] } }],
    ['staff signed in as the user', { ...own, signIn: { session: 's1', staff: true } }],
    ['a session not marked as a sign-in, such as an issued token or a trusted app', { user: own.user }],
    ['a session without a user id', { ...own, user: { id: '', roles: [] } }],
  ])('refuses %s', (_, session) => {
    expect(() => ownDeviceUser(session as Session)).toThrow(expect.objectContaining({ status: 403 }))
  })
})
