import { describe, expect, it, vi } from 'vitest'
import { scopedDb } from '@protobase/query'
import { db } from '../../../../test-support/compile-sql'
import { resolveNames } from '../better-auth/names/resolve-names'
import { appScope } from './app-scope'

const offNames = resolveNames({ schema: 'auth', tables: { member: { name: 'memberships' } }, modules: ['auth', 'personal_access_tokens'] })
const member = { user: { id: 'ann', roles: [] }, tenant: 'main' }

describe('appScope', () => {
  it("keeps to the session's active organization while organizations are on", async () => {
    const scope = await appScope({ organizations: true, names: resolveNames({ schema: 'auth', modules: ['auth', 'organizations'] }) })()
    expect(scope.tables.tables.map(({ table }) => table)).toEqual(['member', 'invitation'])
    expect(scope.pinned).toBeUndefined()
    expect(scope.organizationOf({ ...member, organization: { id: 'acme' } })).toBe('acme')
    expect(scope.organizationOf(member)).toBeUndefined()
  })

  it('keeps the tables organizations left, under their names, to the pinned organization while they are off after being on', async () => {
    const scope = await appScope({ organizations: false, names: offNames, pinned: async () => ({ id: 'main' }) })()
    expect(scope.tables.tables).toEqual([
      { schema: 'auth', table: 'memberships', column: 'organization_id' },
      { schema: 'auth', table: 'invitation', column: 'organization_id' },
      { schema: 'auth', table: 'personal_access_token', column: 'organization_id' },
    ])
    expect(scope.pinned).toBe('main')
    expect(scope.organizationOf(member)).toBe('main')
    expect(scope.organizationOf({ ...member, tenant: 'elsewhere' })).toBeUndefined()
    expect(scope.organizationOf(undefined)).toBeUndefined()
  })

  it('gives work in no organization, such as a recurring job, none of the kept rows while pinned, as with organizations on', async () => {
    const { tables } = await appScope({ organizations: false, names: offNames, pinned: async () => ({ id: 'main' }) })()
    expect(scopedDb(db, tables, undefined).selectFrom('auth.memberships').select('id').compile().sql).toBe('select "id" from "auth"."memberships" where false')
    expect(scopedDb(db, tables, 'main').selectFrom('auth.memberships').select('id').compile().parameters).toEqual(['main'])
  })

  it('scopes nothing in an app whose organizations were never on, or without sign-in', async () => {
    const never = await appScope({ organizations: false, names: offNames, pinned: async () => undefined })()
    expect(never.tables.tables).toEqual([])
    expect(never.organizationOf(member)).toBeUndefined()
    expect((await appScope({ organizations: false, names: undefined })()).tables.tables).toEqual([])
  })

  it('reads the pinned organization only when asked, not as it is made', async () => {
    const pinned = vi.fn(async () => ({ id: 'main' }))
    const read = appScope({ organizations: false, names: offNames, pinned })
    expect(pinned).not.toHaveBeenCalled()
    await read()
    expect(pinned).toHaveBeenCalledOnce()
  })
})
