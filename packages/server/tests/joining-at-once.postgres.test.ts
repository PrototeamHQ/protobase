import { describe, expect, it } from 'vitest'
import { createAuth } from '../src/better-auth/create-auth'
import { acceptInvitation, type StoredInvitation } from '../src/better-auth/organizations/accept-invitation'
import { addEveryUser } from '../src/better-auth/organizations/add-every-user'
import { createOrganization } from '../src/better-auth/organizations/host'
import type { AuthContext } from '../src/better-auth/organizations/store'
import { createUser } from '../src/better-auth/users'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'

// People joining one organization at the same moment, on connections of their own: what a recording, on its one
// connection, cannot replay.
const ready = await postgresTemplateReady('auth')

const authOn = (store: Awaited<ReturnType<typeof openPostgresDatabase>>, membershipLimit?: number) =>
  createAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: 'http://localhost:5173',
    secret: 'test-secret-test-secret-test-secret-1234',
    mailer: false,
    organizations: { generateId: () => 'acme', create: 'everyone', membershipLimit },
  })

describe.skipIf(!ready)('accepting invitations at the same moment', () => {
  it('lets no more members in than the organization may have', async () => {
    const store = await openPostgresDatabase('auth')
    const auth = authOn(store, 2)
    const context = (await auth.$context) as unknown as AuthContext
    await createUser(auth, { email: 'root@example.com' })
    await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'root@example.com' })
    const people = await Promise.all(['ana@example.com', 'bo@example.com', 'cy@example.com'].map((email) => createUser(auth, { email, role: 'user' })))
    const invitations = people.map(({ id, email }): StoredInvitation => ({ id: `invitation-${id}`, organizationId: 'acme', email, role: 'member', appRoles: [], status: 'pending', expiresAt: new Date(Date.now() + 86_400_000), inviterId: people[0]!.id }))
    for (const invitation of invitations) {
      await store.exec(`insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id, app_roles)
        values ('${invitation.id}', 'acme', '${invitation.email}', 'member', 'pending', now() + interval '1 day', '${invitation.inviterId}', '[]')`)
    }
    const accepts = await Promise.allSettled(people.map((person, i) => acceptInvitation(context, invitations[i]!, { ...person, emailVerified: true }, 2)))
    expect(accepts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    expect(accepts.filter(({ status }) => status === 'rejected').map((accept) => (accept as PromiseRejectedResult).reason.body.code)).toEqual(['MEMBERSHIP_LIMIT_REACHED', 'MEMBERSHIP_LIMIT_REACHED'])
    expect((await store.db.selectFrom('member').selectAll().execute()).length).toBe(2)
  })
})

describe.skipIf(!ready)('bringing every user into an organization twice at the same moment', () => {
  it('makes each of 150 users a member once', async () => {
    const store = await openPostgresDatabase('auth')
    const auth = authOn(store)
    await auth.$context
    await createUser(auth, { email: 'root@example.com' })
    await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'root@example.com' })
    await store.exec(`insert into "user" (id, name, email, email_verified, role, banned, created_at, updated_at)
      select 'u' || lpad(i::text, 3, '0'), 'User ' || i, 'user' || i || '@example.com', true, 'user', false, now(), now() from generate_series(1, 150) i`)
    const runs = await Promise.all([addEveryUser(auth, 'acme'), addEveryUser(auth, 'acme')])
    expect(runs.map((joined) => joined.length).sort()).toEqual([0, 150])
    const counted = await store.db.selectFrom('member').select(({ fn }) => [fn.countAll<string>().as('members'), fn.count<string>('user_id').distinct().as('people')]).execute()
    expect(counted).toEqual([{ members: '151', people: '151' }])
  })
})
