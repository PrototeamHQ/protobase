import { describe, expect, it } from 'vitest'
import { fakeContext } from '../testing/fake-adapter'
import { sessionMemberships } from './session-memberships'

const member = (organizationId: string, userId: string, appRoles: string[]) => ({ id: `${organizationId}-${userId}`, organizationId, userId, role: 'member', appRoles, createdAt: new Date('2026-01-01') })

// Ana sells and manages in one organization, manages in another and holds no role in a third; Bo holds support
// globally, which enters every organization, and is a member of one.
const { context } = fakeContext({
  user: [{ id: 'ana', role: 'user' }, { id: 'bo', role: 'support' }],
  member: [member('1', 'ana', ['sales', 'manager']), member('2', 'ana', ['manager']), member('3', 'ana', []), member('1', 'bo', [])],
  organization: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }],
})

describe('sessionMemberships', () => {
  it('gives each membership the active role where it is held there, else the first role there', async () => {
    expect(await sessionMemberships(context, 'ana', ['manager'])).toEqual([{ tenant: '1', roles: ['manager'] }, { tenant: '2', roles: ['manager'] }, { tenant: '3', roles: [] }])
    expect(await sessionMemberships(context, 'ana', ['sales'])).toEqual([{ tenant: '1', roles: ['sales'] }, { tenant: '2', roles: ['manager'] }, { tenant: '3', roles: [] }])
  })

  it('counts a global role in each membership, and enters no organization the person is not a member of', async () => {
    expect(await sessionMemberships(context, 'bo', ['support'])).toEqual([{ tenant: '1', roles: ['support'] }])
  })

  it('answers none for someone the store does not know', async () => {
    expect(await sessionMemberships(context, 'cy', ['sales'])).toEqual([])
  })
})
