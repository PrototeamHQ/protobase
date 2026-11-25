import { describe, expect, it } from 'vitest'
import type { ScopedDb } from '@protobase/query'
import { db } from '../../../../test-support/compile-sql'
import { appAuthOptions, type AuthHooks } from './auth-settings'
import type { StoredMember, StoredOrganization } from './organizations/store'

const organizations = { enabled: true, default: { id: 'main', name: 'Main', slug: 'main' } }

// The members each hook's `db` reads, as it sends the query.
const membersRead = (seen: ScopedDb) => seen.selectFrom('auth.member').select('id').compile()

describe('appAuthOptions', () => {
  it('gives each hook the database kept to the organization it is about', async () => {
    const seen: ScopedDb[] = []
    const hooks: AuthHooks = {
      generateOrganizationId: ({ db: hookDb }) => (seen.push(hookDb), 'acme'),
      onOrganizationCreated: async (_input, { db: hookDb }) => void seen.push(hookDb),
      organizationHooks: {
        afterAddMember: async (_input, { db: hookDb }) => void seen.push(hookDb),
        beforeAddMember: async (_input, { db: hookDb }) => void seen.push(hookDb),
      },
    }
    const options = appAuthOptions({ baseURL: 'http://localhost:1', secret: 'a-secret-of-thirty-two-characters!', organizations }, { db, hooks })
    await options.organizations!.generateId!()
    await options.organizations!.onCreated!({ organization: { id: 'acme' } as StoredOrganization, member: {} as StoredMember })
    await (options.organizations!.hooks!.afterAddMember as (input: unknown) => Promise<void>)({ organization: { id: 'globex' } })
    await (options.organizations!.hooks!.beforeAddMember as (input: unknown) => Promise<void>)({ member: { organizationId: 'initech' } })
    expect(seen.map(membersRead)).toMatchObject([
      { sql: 'select "id" from "auth"."member" where false', parameters: [] },
      { sql: 'select "id" from "auth"."member" where "auth"."member"."organization_id" = $1', parameters: ['acme'] },
      { sql: 'select "id" from "auth"."member" where "auth"."member"."organization_id" = $1', parameters: ['globex'] },
      { sql: 'select "id" from "auth"."member" where "auth"."member"."organization_id" = $1', parameters: ['initech'] },
    ])
  })

  it('gives a hook about no organization the pinned one while organizations are off after being on, and none before', async () => {
    const seen: ScopedDb[] = []
    const hooks: AuthHooks = {
      generateUserId: ({ db: hookDb }) => (seen.push(hookDb), 'u1'),
      onUserCreated: async (_user, _context, { db: hookDb }) => void seen.push(hookDb),
    }
    const off = { ...organizations, enabled: false }
    const settings = { baseURL: 'http://localhost:1', secret: 'a-secret-of-thirty-two-characters!', organizations: off, personalAccessTokens: { prefix: 'app_' } }
    const pinnedOptions = appAuthOptions(settings, { db, hooks, pinned: async () => ({ id: 'main' }) })
    await (pinnedOptions.generateUserId as () => Promise<string>)()
    await pinnedOptions.onUserCreated!({} as Parameters<NonNullable<AuthHooks['onUserCreated']>>[0], null)
    await (appAuthOptions(settings, { db, hooks, pinned: async () => undefined }).generateUserId as () => Promise<string>)()
    const tokensRead = (hookDb: ScopedDb) => hookDb.selectFrom('auth.personal_access_token').select('id').compile()
    expect(seen.map(tokensRead)).toMatchObject([
      { sql: 'select "id" from "auth"."personal_access_token" where "auth"."personal_access_token"."organization_id" = $1', parameters: ['main'] },
      { sql: 'select "id" from "auth"."personal_access_token" where "auth"."personal_access_token"."organization_id" = $1', parameters: ['main'] },
      { sql: 'select "id" from "auth"."personal_access_token"', parameters: [] },
    ])
  })

  it('gives sign-in the database as it is', () => {
    const options = appAuthOptions({ baseURL: 'http://localhost:1', secret: 'a-secret-of-thirty-two-characters!', organizations }, { db })
    expect(options.database).toMatchObject({ db })
  })
})
