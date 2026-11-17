import { describe, expect, it, vi } from 'vitest'
import { createAuth } from '../src/better-auth/create-auth'
import { addAppRoleToOwners, listOrganizations, ownOrganizationsWithoutMembers } from '../src/better-auth/organizations/host'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// The organization functions past the 100,000 rows a whole read of the store stops at, on a real Postgres made in one
// statement each: too many rows for a recording to hold.
vi.setConfig({ testTimeout: 60_000 })

const ready = await postgresTemplateReady('auth')

const past = 100_010

const authOn = (store: PostgresDatabase) =>
  createAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: 'http://localhost:5173',
    secret: 'test-secret-test-secret-test-secret-1234',
    mailer: false,
    roles: { sales: 'Sales', manager: 'Manager' },
    organizations: { create: 'everyone' },
  })

// Organizations made a microsecond apart, the last one newest.
const organizations = (count: number) => `insert into organization (id, name, slug, created_at)
  select 'o' || i, 'Organization ' || i, 'organization-' || i, timestamptz '2026-07-01 00:00:00+00' + i * interval '1 microsecond' from generate_series(1, ${count}) i`

const root = `insert into "user" (id, name, email, email_verified, role, banned, created_at, updated_at)
  values ('root', 'Root', 'root@example.com', true, 'admin', false, now(), now())`

describe.skipIf(!ready)('the organization functions, past 100,000 rows', () => {
  it('give an app role to every one of 100,010 owners who lacks it, and to no one else', async () => {
    const store = await openPostgresDatabase('auth')
    const auth = authOn(store)
    await auth.$context
    await store.exec(`${organizations(1)};
      insert into "user" (id, name, email, email_verified, role, banned, created_at, updated_at)
        select 'u' || i, 'User ' || i, 'user' || i || '@example.com', true, 'user', false, now(), now() from generate_series(1, ${past + 2}) i;
      insert into member (id, organization_id, user_id, role, created_at, app_roles)
        select 'm' || i, 'o1', 'u' || i, case when i = ${past + 1} then 'member' else ' admin , owner' end, now(),
          case when i = 1 then '["sales"]'::jsonb when i = ${past + 2} then null else '[]'::jsonb end
        from generate_series(1, ${past + 2}) i`)
    // The first owner holds it already and the next to last is no owner; the last owner holds no roles at all.
    expect(await addAppRoleToOwners(auth, 'sales')).toBe(past)
    const rows = await store.db.selectFrom('member').select(['user_id', 'app_roles']).where('user_id', 'in', ['u1', 'u2', `u${past + 1}`, `u${past + 2}`]).orderBy('user_id').execute()
    expect(rows).toEqual([
      { user_id: 'u1', app_roles: ['sales'] },
      { user_id: `u${past + 1}`, app_roles: [] },
      { user_id: `u${past + 2}`, app_roles: ['sales'] },
      { user_id: 'u2', app_roles: ['sales'] },
    ])
    expect(await addAppRoleToOwners(auth, 'sales')).toBe(0)
  })

  it('make the first user the owner of each of 100,010 organizations without members', async () => {
    const store = await openPostgresDatabase('auth')
    const auth = authOn(store)
    await auth.$context
    await store.exec(`${organizations(past)}; ${root};
      insert into member (id, organization_id, user_id, role, created_at) values ('kept', 'o5', 'root', 'member', now())`)
    expect(await ownOrganizationsWithoutMembers(auth, 'root')).toBe(past - 1)
    const rows = await store.db.selectFrom('member').select(({ fn }) => [fn.countAll<string>().as('members'), fn.count<string>('organization_id').distinct().as('organizations')]).execute()
    expect(rows).toEqual([{ members: String(past), organizations: String(past) }])
    expect(await store.db.selectFrom('member').select(['role', 'app_roles']).where('organization_id', '=', `o${past}`).execute()).toEqual([{ role: 'owner', app_roles: ['sales', 'manager'] }])
  })

  it('list each of 100,010 organizations once, oldest first, page by page, with their members', async () => {
    const store = await openPostgresDatabase('auth')
    const auth = authOn(store)
    await auth.$context
    await store.exec(`${organizations(past)}; ${root};
      insert into member (id, organization_id, user_id, role, created_at, app_roles) values ('newest', 'o${past}', 'root', 'owner', now(), '["manager"]')`)
    const slugs: string[] = []
    let page = await listOrganizations(auth, { size: 25_000 })
    for (;;) {
      slugs.push(...page.organizations.map((organization) => organization.slug))
      if (!page.next) break
      page = await listOrganizations(auth, { after: page.next, size: 25_000 })
    }
    expect(slugs).toHaveLength(past)
    expect(new Set(slugs).size).toBe(past)
    expect([slugs[0], slugs.at(-1)]).toEqual(['organization-1', `organization-${past}`])
    expect(page.organizations.at(-1)!.members).toEqual([{ email: 'root@example.com', role: 'owner', appRoles: ['manager'] }])
  })
})
