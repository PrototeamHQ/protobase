import { describe, expect, it } from 'vitest'
import { scopedDb } from '@protobase/query'
import { db as compileDb } from '../../../../test-support/compile-sql'
import { resolveNames } from '../better-auth/names/resolve-names'
import { organizationTables, sessionOrganization } from './organization-tables'

describe('organizationTables', () => {
  it("lists the store's tables of an organization's rows under their configured names, while organizations are on", () => {
    const names = resolveNames({ schema: 'accounts', tables: { prefix: 'app_', member: { name: 'memberships', columns: { organization_id: 'org_id' } } }, modules: ['auth', 'organizations', 'personal_access_tokens'] })
    expect(organizationTables(names).tables).toEqual([
      { schema: 'accounts', table: 'memberships', column: 'org_id' },
      { schema: 'accounts', table: 'app_invitation', column: 'organization_id' },
      { schema: 'accounts', table: 'app_personal_access_token', column: 'organization_id' },
    ])
  })

  it('scopes a store in public, which unqualified names find, and keeps a project table of another schema apart', () => {
    const scope = organizationTables(resolveNames({ schema: 'public', modules: ['auth', 'organizations'] }))
    const db = scopedDb(compileDb, scope, 'acme')
    expect(db.selectFrom('member').select('id').compile().sql).toBe('select "id" from "member" where "member"."organization_id" = $1')
    expect(db.selectFrom('app.member').select('id').compile().sql).toBe('select "id" from "app"."member"')
  })

  it('lists none without organizations, as no table then holds an organization', () => {
    expect(organizationTables(resolveNames({ schema: 'auth', modules: ['auth', 'personal_access_tokens'] })).tables).toEqual([])
    expect(organizationTables(undefined).tables).toEqual([])
  })

  it("takes a session's active organization, and none for a session without one", () => {
    expect(sessionOrganization({ user: { id: 'u', roles: [] }, tenant: 'acme', organization: { id: 'acme' } })).toBe('acme')
    expect(sessionOrganization({ user: { id: 'u', roles: [] }, tenant: 7 })).toBeUndefined()
  })
})
