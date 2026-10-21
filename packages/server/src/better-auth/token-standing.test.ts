import { describe, expect, it } from 'vitest'
import type { AuthContext } from './organizations/store'
import { checkTokenStanding, tokenClaims } from './token-standing'

const now = new Date('2026-08-01T12:00:00Z')
const later = new Date('2026-08-02T12:00:00Z')
const earlier = new Date('2026-07-31T12:00:00Z')

type Rows = { user?: Record<string, unknown>[]; session?: Record<string, unknown>[]; member?: Record<string, unknown>[]; organization?: Record<string, unknown>[] }

// The store's rows, found by every field the lookup names.
const contextWith = (rows: Rows) => {
  const findOne = async ({ model, where }: { model: keyof Rows; where: { field: string; value: unknown }[] }) =>
    rows[model]?.find((row) => where.every(({ field, value }) => row[field] === value)) ?? null
  return { adapter: { findOne } } as unknown as AuthContext
}

const alice = { id: 'alice', role: 'admin', banned: false, banExpires: null }
const session = { id: 's1', userId: 'alice', expiresAt: later }

const standing = (rows: Rows, claims: Partial<Parameters<typeof checkTokenStanding>[1]>, organizations = false) =>
  checkTokenStanding(contextWith(rows), { userId: 'alice', roles: ['admin'], ...claims }, organizations, now).then(
    () => 'stands',
    (problem: { status: number }) => problem.status,
  )

describe('tokenClaims', () => {
  it('reads the session, leaves out the placeholder role and takes only a text organization', () => {
    expect(tokenClaims({ sub: 'alice', sid: 's1' }, ['user', 'sales'], '1')).toEqual({ userId: 'alice', sessionId: 's1', roles: ['sales'], organizationId: '1' })
    expect(tokenClaims({ sub: 'alice' }, ['admin'], undefined)).toEqual({ userId: 'alice', roles: ['admin'] })
  })
})

describe('checkTokenStanding', () => {
  it('lets a token stand while its session, user and roles do', async () => {
    expect(await standing({ user: [alice], session: [session] }, { sessionId: 's1' })).toBe('stands')
    expect(await standing({ user: [alice] }, {})).toBe('stands')
  })

  it('ends a token whose session is gone, expired or someone else\'s', async () => {
    expect(await standing({ user: [alice] }, { sessionId: 's1' })).toBe(401)
    expect(await standing({ user: [alice], session: [{ ...session, expiresAt: earlier }] }, { sessionId: 's1' })).toBe(401)
    expect(await standing({ user: [alice], session: [{ ...session, userId: 'bob' }] }, { sessionId: 's1' })).toBe(401)
  })

  it('ends a token of a deleted or banned user, and stands again once a ban runs out', async () => {
    expect(await standing({}, {})).toBe(401)
    expect(await standing({ user: [{ ...alice, banned: true }] }, {})).toBe(401)
    expect(await standing({ user: [{ ...alice, banned: true, banExpires: later }] }, {})).toBe(401)
    expect(await standing({ user: [{ ...alice, banned: true, banExpires: earlier }] }, {})).toBe('stands')
  })

  it('ends a token carrying a role the user no longer holds, not one carrying fewer', async () => {
    expect(await standing({ user: [{ ...alice, role: 'user' }] }, {})).toBe(401)
    expect(await standing({ user: [{ ...alice, role: 'admin,sales' }] }, { roles: ['sales'] })).toBe('stands')
  })

  it('with organizations, reads the membership\'s app roles, and lets a global role enter an organization that exists', async () => {
    const sanne = { ...alice, role: 'user' }
    const member = { organizationId: '1', userId: 'alice', role: 'member', appRoles: ['sales'] }
    expect(await standing({ user: [sanne], member: [member] }, { roles: ['sales'], organizationId: '1' }, true)).toBe('stands')
    expect(await standing({ user: [sanne], member: [{ ...member, appRoles: [] }] }, { roles: ['sales'], organizationId: '1' }, true)).toBe(401)
    expect(await standing({ user: [sanne] }, { roles: [], organizationId: '1' }, true)).toBe(401)
    expect(await standing({ user: [alice], organization: [{ id: '1' }] }, { organizationId: '1' }, true)).toBe('stands')
    expect(await standing({ user: [alice] }, { organizationId: '1' }, true)).toBe(401)
  })
})
