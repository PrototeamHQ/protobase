import { describe, expect, it, vi } from 'vitest'
import { createAuth, loadAuthPlugins, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { checkMcpGrant } from '../src/better-auth/mcp/grant-standing'
import { createOrganization } from '../src/better-auth/organizations/host'
import { startingOrganization } from '../src/better-auth/organizations/session-organization'
import type { AuthContext } from '../src/better-auth/organizations/store'
import { createUser } from '../src/better-auth/users'
import { betterAuthCommentUsers } from '../src/comments/comment-users'
import { betterAuthActorNames } from '../src/history/actor-names'
import type { TokenAuth } from '../src/personal-mail/linked-accounts'
import { betterAuthOwnerRoles } from '../src/webhooks/table/owner-roles'
import { betterAuthConnectionAccounts } from '../src/workflows/connections/connection-accounts'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { largeTable, seqScansOf, watchStatements } from '../../../test-support/query-plans'

// What the auth code reads of a person or an organization, asked of the store: right past the number of rows a read
// once fetched (Better Auth's 100 by default, or 100,000), and by an index. Too many rows for a recording to hold.
vi.setConfig({ testTimeout: 120_000 })

const ready = await postgresTemplateReady('auth')

const password = 'correct-horse-battery-staple'

const serve = async (more: Partial<CreateAuthOptions> = {}) => {
  const store = await openPostgresDatabase('auth')
  const watched = watchStatements(store)
  const options: CreateAuthOptions = {
    database: { dialect: watched.dialect, type: 'postgres' },
    baseURL: 'http://localhost:5173',
    secret: 'test-secret-test-secret-test-secret-1234',
    mailer: false,
    organizations: { create: 'everyone' },
    ...more,
  }
  const auth = createAuth(options, await loadAuthPlugins(options))
  const context = (await auth.$context) as unknown as AuthContext
  const request = (path: string, init: { cookie?: string; body?: unknown } = {}) =>
    auth.handler(
      new Request(`http://localhost:5173${path}`, {
        method: init.body === undefined ? 'GET' : 'POST',
        headers: { origin: 'http://localhost:5173', ...(init.body !== undefined && { 'content-type': 'application/json' }), ...(init.cookie && { cookie: init.cookie }) },
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      }),
    )
  const signIn = async (email: string) => {
    const response = await request('/api/auth/sign-in/email', { body: { email, password } })
    expect(response.status).toBe(200)
    return response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  }
  // The rows, then the statistics the planner reads them by, as autovacuum would keep them.
  const fill = async (statements: string) => {
    await store.exec(`${statements}; analyze`)
    watched.forget()
  }
  return { store, auth, context, request, signIn, fill, ...watched }
}

const users = (count: number) => `insert into "user" (id, name, email, email_verified, role, banned, created_at, updated_at)
  select 'u' || i, 'User ' || i, 'user' || i || '@example.com', true, 'user', false, now(), now() from generate_series(1, ${count}) i`

describe.skipIf(!ready)('the auth reads', () => {
  it('list every one of the 100,005 people of an organization once, in the session it starts in, and a few by the index', async () => {
    const { auth, fill, request, signIn, plansOf } = await serve()
    await createUser(auth, { email: 'root@example.com', password, name: 'Root' })
    await createUser(auth, { email: 'few@example.com', password, name: 'Few' })
    const { organization } = await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'root@example.com' })
    const { organization: small } = await createOrganization(auth, { name: 'Globex', slug: 'globex', owner: 'few@example.com' })
    await fill(`${largeTable('"user"', ['id'])}; ${largeTable('member', ['organization_id', 'user_id'])}; ${users(100_004)};
      insert into member (id, organization_id, user_id, role, created_at) select 'm' || i, '${organization.id}', 'u' || i, 'member', now() from generate_series(1, 100004) i;
      insert into member (id, organization_id, user_id, role, created_at) values ('again', '${small.id}', (select id from "user" where email = 'few@example.com'), 'member', now())`)
    const peopleOf = async (email: string) => {
      const answer = await request('/api/auth/organization/people', { cookie: await signIn(email) })
      expect(answer.status).toBe(200)
      return ((await answer.json()) as { people: { name: string }[] }).people.map((person) => person.name)
    }
    // A person whose membership is kept twice is listed once.
    expect(await peopleOf('few@example.com')).toEqual(['Few'])
    expect(seqScansOf(await plansOf('user'), 'user')).toEqual([])
    const people = await peopleOf('root@example.com')
    expect(people).toHaveLength(100_005)
    expect(people[0]).toBe('Root')
  })

  it('start a session in the last organization while the person may enter it, else in their oldest, the 100,001st of their memberships', async () => {
    const { context, fill, plansOf } = await serve()
    await fill(`${largeTable('member', ['organization_id', 'user_id'])}; ${largeTable('organization', ['id'])}; ${users(2)};
      insert into organization (id, name, slug, created_at) values ('acme', 'Acme', 'acme', now()), ('globex', 'Globex', 'globex', now()), ('initech', 'Initech', 'initech', now());
      insert into member (id, organization_id, user_id, role, created_at) values ('m1', 'globex', 'u1', 'member', '2026-02-01'), ('m2', 'acme', 'u1', 'member', '2026-01-01');
      insert into organization (id, name, slug, created_at) select 'o' || i, 'Organization ' || i, 'organization-' || i, now() from generate_series(1, 100001) i;
      insert into member (id, organization_id, user_id, role, created_at) select 'n' || i, 'o' || i, 'u2', 'member', '2026-01-01'::timestamptz + i * interval '1 second' from generate_series(1, 100000) i;
      insert into member (id, organization_id, user_id, role, created_at) values ('n100001', 'o100001', 'u2', 'member', '2025-01-01')`)
    const start = (id: string, lastOrganizationId: string | null, role = 'user') => startingOrganization(context.adapter, { id, role, lastOrganizationId })
    expect(await start('u1', 'globex')).toBe('globex')
    expect(await start('u1', 'initech')).toBe('acme')
    expect(await start('u1', 'initech', 'support')).toBe('initech')
    expect(await start('u1', 'gone', 'support')).toBe('acme')
    expect(await start('u1', null)).toBe('acme')
    // A person of a few memberships has them read by the index; one of nearly every row, by reading them all.
    expect(seqScansOf(await plansOf('member'), 'member')).toEqual([])
    expect(await start('u2', null)).toBe('o100001')
  })

  it("stand an MCP grant on the consent made before the token, behind 150 newer ones", async () => {
    const { context, fill } = await serve({ mcp: true })
    await fill(`${users(1)}; insert into oauth_client (id, client_id, redirect_uris) values ('c1', 'assistant', '[]');
      insert into oauth_consent (id, client_id, user_id, scopes, created_at, updated_at) select 'newer-' || i, 'assistant', 'u1', '[]', '2026-08-02', now() from generate_series(1, 150) i;
      insert into oauth_consent (id, client_id, user_id, scopes, created_at, updated_at) values ('kept', 'assistant', 'u1', '[]', '2026-08-01T10:00:00Z', now())`)
    const issuedAt = Date.parse('2026-08-01T10:01:00Z') / 1000
    await expect(checkMcpGrant(context.adapter, { userId: 'u1', clientId: 'assistant', issuedAt })).resolves.toBeUndefined()
    await expect(checkMcpGrant(context.adapter, { userId: 'u1', clientId: 'assistant', issuedAt: Date.parse('2026-08-01T09:00:00Z') / 1000 })).rejects.toThrow('disconnected')
  })

  it("offer each of the person's 101 passkeys of the asked RP ID, behind 150 of their others", async () => {
    const { auth, store, fill, request, signIn } = await serve()
    const { id } = await createUser(auth, { email: 'root@example.com', password, name: 'Root' })
    const passkey = (name: string, rpId: string | null) => `('${name}', 'key', '${id}', '${name}', 0, 'singleDevice', false, ${rpId === null ? 'null' : `'${rpId}'`})`
    await fill(`insert into passkey (id, public_key, user_id, credential_id, counter, device_type, backed_up, rp_id)
      select 'p' || i, 'key', '${id}', 'elsewhere-' || i, 0, 'singleDevice', false, 'elsewhere.example' from generate_series(1, 150) i;
      insert into passkey (id, public_key, user_id, credential_id, counter, device_type, backed_up, rp_id)
      select 'h' || i, 'key', '${id}', 'here-' || i, 0, 'singleDevice', false, 'localhost' from generate_series(1, 100) i;
      insert into passkey (id, public_key, user_id, credential_id, counter, device_type, backed_up, rp_id) values ${passkey('here', 'localhost')}, ${passkey('before', null)}`)
    const options = await request('/api/auth/passkey/generate-authenticate-options', { cookie: await signIn('root@example.com') })
    const { allowCredentials } = (await options.json()) as { allowCredentials?: { id: string }[] }
    // A passkey made before passkeys kept their RP ID is the first host's, here the passkey domain.
    expect(allowCredentials?.map((credential) => credential.id).toSorted()).toEqual(['before', 'here', ...Array.from({ length: 100 }, (_, i) => `here-${i + 1}`)].toSorted())
    expect(await store.db.selectFrom('passkey').select(({ fn }) => fn.countAll<string>().as('count')).executeTakeFirstOrThrow()).toEqual({ count: '252' })
  })

  it("find a person's account by its id, behind 150 of their others, and none of someone else's", async () => {
    const { auth, fill, plansOf } = await serve()
    await fill(`${largeTable('account', ['user_id'])}; ${users(2)};
      insert into account (id, account_id, provider_id, user_id, created_at, updated_at) select 'a' || i, 'a' || i, 'other', 'u1', now(), now() from generate_series(1, 150) i;
      insert into account (id, account_id, provider_id, user_id, scope, created_at, updated_at) values ('mail', 'mail', 'google', 'u1', 'email,gmail', now(), now());
      insert into account (id, account_id, provider_id, user_id, created_at, updated_at) select 'b' || i, 'b' || i, 'other', 'u2', now(), now() from generate_series(1, 100000) i`)
    const accounts = betterAuthConnectionAccounts(auth as unknown as TokenAuth)
    expect(await accounts.find('u1', 'mail')).toEqual({ id: 'mail', providerId: 'google', scopes: ['email', 'gmail'], refreshToken: null })
    expect(await accounts.find('u2', 'mail')).toBeUndefined()
    expect(seqScansOf(await plansOf('account'), 'account')).toEqual([])
  })

  it('name the actors of a page, 150 of 100,002 users, in one read by the key', async () => {
    const { auth, fill, plansOf } = await serve()
    await fill(`${largeTable('"user"', ['id'])}; ${users(100_002)}`)
    const ids = [...Array.from({ length: 150 }, (_, i) => `u${String(i + 1)}`), 'u1', 'gone']
    const names = await betterAuthActorNames(auth)(ids)
    expect(Object.keys(names)).toHaveLength(150)
    expect(names.u150).toBe('User 150')
    const plans = await plansOf('user')
    expect([plans.length, seqScansOf(plans, 'user')]).toEqual([1, []])
  })

  it("give each of 1,000 owners the role they act with now, in one read of the users and one of the memberships", async () => {
    const { auth, fill, plansOf } = await serve()
    await fill(`${largeTable('"user"', ['id'])}; ${largeTable('member', ['organization_id', 'user_id'])}; ${users(100_002)};
      insert into organization (id, name, slug, created_at) values ('acme', 'Acme', 'acme', now());
      insert into member (id, organization_id, user_id, role, app_roles, created_at) select 'm' || i, 'acme', 'u' || i, 'member', '["sales"]', now() from generate_series(1, 100000) i;
      update "user" set role = 'support', last_role = case when i <= 500 then 'sales' end from generate_series(1, 1000) i where id = 'u' || i;
      update "user" set banned = true where id = 'u1000'`)
    const roles = betterAuthOwnerRoles(auth)
    const owners = [...Array.from({ length: 1000 }, (_, i) => ({ id: `u${String(i + 1)}`, tenant: 'acme' })), { id: 'u1' }, { id: 'u100001', tenant: 'acme' }, { id: 'gone', tenant: 'acme' }]
    const held = await Promise.all(owners.map(roles))
    // A member's last chosen role while they hold it, else their first, a global one; outside the tenant, the global ones.
    expect(held.slice(0, 500).every((one) => one.join() === 'sales')).toBe(true)
    expect(held.slice(500, 999).every((one) => one.join() === 'support')).toBe(true)
    expect(held.slice(999)).toEqual([[], ['support'], [], []])
    const plans = [...(await plansOf('user')), ...(await plansOf('member'))]
    expect([plans.length, seqScansOf(plans, 'user'), seqScansOf(plans, 'member')]).toEqual([2, [], []])
  })

  it('find the people a comment may mention past 100,000 banned users whose names come first, by the index', async () => {
    const { auth, fill, plansOf, forget } = await serve()
    const person = (id: string, name: string, banned = false, until = 'null') => `('${id}', '${name}', '${id}@example.com', true, 'user', ${banned}, ${until}, now(), now())`
    await fill(`${largeTable('"user"', ['id', 'name'])};
      insert into "user" (id, name, email, email_verified, role, banned, ban_expires, created_at, updated_at)
      select 'u' || i, 'Aaron ' || i, 'user' || i || '@example.com', true, 'user', true, null, now(), now() from generate_series(1, 100000) i;
      insert into "user" (id, name, email, email_verified, role, banned, ban_expires, created_at, updated_at) values ${person('nameless', '')},
        ${person('active', 'Aaron Active')}, ${person('lapsed', 'Aaron Lapsed', true, "'2026-01-01'")}, ${person('zed', 'Zed Aaron')}, ${person('later', 'Aaron Later', true, "'2099-01-01'")}`)
    const users = betterAuthCommentUsers(auth)
    const names = async (query: string, limit: number) => (await users.search(query, limit)).map((user) => user.name)
    // A ban whose end has passed no longer stands; a name with LIKE's wildcards in it is matched as it is written.
    expect(await names('aaron', 8)).toEqual(['Aaron Active', 'Aaron Lapsed', 'Zed Aaron'])
    expect(await names('AARON A', 8)).toEqual(['Aaron Active'])
    expect(await names('%', 8)).toEqual([])
    expect(await names('', 2)).toEqual(['Aaron Active', 'Aaron Lapsed'])
    // A part of a name few users have is found by the trigram index; one nearly all have, by reading them all.
    forget()
    expect(await names('zed', 8)).toEqual(['Zed Aaron'])
    expect(seqScansOf(await plansOf('user'), 'user')).toEqual([])
  })
})
