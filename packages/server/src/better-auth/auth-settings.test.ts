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
      organizationHooks: { afterAddMember: async (_input, { db: hookDb }) => void seen.push(hookDb) },
    }
    const options = appAuthOptions({ baseURL: 'http://localhost:1', secret: 'a-secret-of-thirty-two-characters!', organizations }, { db, hooks })
    await options.organizations!.generateId!()
    await options.organizations!.onCreated!({ organization: { id: 'acme' } as StoredOrganization, member: {} as StoredMember })
    await (options.organizations!.hooks!.afterAddMember as (input: unknown) => Promise<void>)({ organization: { id: 'globex' } })
    expect(seen.map(membersRead)).toMatchObject([
      { sql: 'select "id" from "auth"."member" where false', parameters: [] },
      { sql: 'select "id" from "auth"."member" where "auth"."member"."organization_id" = $1', parameters: ['acme'] },
      { sql: 'select "id" from "auth"."member" where "auth"."member"."organization_id" = $1', parameters: ['globex'] },
    ])
  })

  it('gives sign-in the database as it is', () => {
    const options = appAuthOptions({ baseURL: 'http://localhost:1', secret: 'a-secret-of-thirty-two-characters!', organizations }, { db })
    expect(options.database).toMatchObject({ db })
  })
})
