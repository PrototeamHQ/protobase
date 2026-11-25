import { describe, expect, it } from 'vitest'
import { inOrganization, signInOrganization } from '../../organization-scope/sign-in-organization'
import { findMember, membershipsOf, type AuthContext } from './store'

// An adapter that answers every read with `rows` and notes the organization sign-in's queries worked in.
const recording = (rows: Record<string, unknown>[]) => {
  const worked: unknown[] = []
  const read = async () => {
    worked.push(signInOrganization())
    return rows
  }
  const adapter = { findMany: read, findOne: async () => (await read())[0] ?? null } as unknown as AuthContext['adapter']
  return { adapter, worked }
}

const member = (organizationId: string) => ({ id: `m-${organizationId}`, organizationId, userId: 'ana', role: 'member', appRoles: [], createdAt: new Date('2026-01-01') })

describe('the store of organizations', () => {
  it("lists a user's own memberships across organizations, saying why, whichever organization the request works in", async () => {
    const { adapter, worked } = recording([member('acme'), member('other')])
    const memberships = await inOrganization('acme', () => membershipsOf(adapter, 'ana'))
    expect(memberships.map((membership) => membership.organizationId)).toEqual(['acme', 'other'])
    expect(worked).toEqual([{ unscoped: 'a user lists their own memberships, one in each organization' }])
  })

  it('reads a membership in the organization it names', async () => {
    const { adapter, worked } = recording([member('other')])
    await inOrganization('acme', () => findMember(adapter, { organizationId: 'other', userId: 'ana' }))
    expect(worked).toEqual(['other'])
  })
})
