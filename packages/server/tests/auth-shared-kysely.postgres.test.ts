import { IdentifierNode, Kysely, OperationNodeTransformer, type KyselyPlugin, type TableNode } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { checkMigrationRecord } from '../src/migration-record/check-record'
import { appAuthOptions } from '../src/better-auth/auth-settings'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { buildAuth } from '../src/better-auth/create-auth'
import { endDeviceSessions } from '../src/better-auth/platform-device-store'
import { createOrganization } from '../src/better-auth/organizations/host'
import { createUser } from '../src/better-auth/users'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'

// Sign-in runs through the app's own Kysely, so a plugin on it sees, and may rewrite, every query of sign-in, sessions,
// tokens, personal access tokens and memberships. Rerun on every Better Auth upgrade: a query that bypasses the app's
// Kysely shows here as a table the spy never saw, or as a failure once its table is renamed.
vi.setConfig({ testTimeout: 30_000 })

const ready = await postgresTemplateReady('auth')

const password = 'correct-horse-battery-staple'
const baseURL = 'http://localhost:5173'
const prefix = 'test_'

// Notes each table a query names, in a query builder or raw SQL alike, and gives it its name in `renamed`.
class TableNames extends OperationNodeTransformer {
  constructor(
    readonly seen: Set<string>,
    readonly renamed: Record<string, string>,
  ) {
    super()
  }

  protected override transformTable(node: TableNode): TableNode {
    const table = super.transformTable(node)
    const { name } = table.table.identifier
    this.seen.add(name)
    const to = this.renamed[name]
    return to ? { ...table, table: { ...table.table, identifier: IdentifierNode.create(to) } } : table
  }
}

const spy = (renamed: Record<string, string> = {}) => {
  const seen = new Set<string>()
  const names = new TableNames(seen, renamed)
  const plugin: KyselyPlugin = {
    transformQuery: ({ node }) => names.transformNode(node),
    transformResult: async ({ result }) => result,
  }
  return { seen, plugin }
}

// The app's sign-in as `serve` builds it, on the app's Kysely with the spy on it.
const serve = async (renamed: Record<string, string> = {}) => {
  const store = await openPostgresDatabase('auth')
  const { seen, plugin } = spy(renamed)
  const db = new Kysely<any>({ dialect: store.dialect, plugins: [plugin] })
  const auth = await buildAuth(appAuthOptions({ baseURL, secret: 'shared-kysely-test-secret-0123456789', schema: 'public', mailer: false, organizations: { enabled: true }, personalAccessTokens: { prefix } }, { db }))
  const request = (path: string, init: { cookie?: string; body?: unknown } = {}) =>
    auth.handler(
      new Request(`${baseURL}${path}`, {
        method: init.body === undefined ? 'GET' : 'POST',
        headers: { origin: baseURL, ...(init.body !== undefined && { 'content-type': 'application/json' }), ...(init.cookie && { cookie: init.cookie }) },
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      }),
    )
  const authenticate = betterAuthAuthenticator({ auth })
  const bearer = (token: string) => authenticate(new Request(`${baseURL}/api/v1/orders`, { headers: { authorization: `Bearer ${token}` } }))
  return { store, auth, seen, request, bearer }
}

// Signs in a member of an organization, reads the session, and uses a JWT and a personal access token of it. As the
// first user, she owns the default organization too, which turning organizations on made, and starts in it.
const signInFlow = async ({ auth, request, bearer }: Awaited<ReturnType<typeof serve>>) => {
  const user = await createUser(auth, { email: 'ana@example.com', password, name: 'Ana' })
  await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'ana@example.com' })
  const signedIn = await request('/api/auth/sign-in/email', { body: { email: 'ana@example.com', password } })
  expect(signedIn.status, await signedIn.clone().text()).toBe(200)
  const cookie = signedIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  const session = (await (await request('/api/auth/get-session', { cookie })).json()) as { user: { id: string } }
  const { token } = (await (await request('/api/auth/token', { cookie })).json()) as { token: string }
  const created = await request('/api/auth/account/personal-access-tokens/create', { cookie, body: { name: 'Script' } })
  expect(created.status, await created.clone().text()).toBe(200)
  const { token: personal } = (await created.json()) as { token: string }
  return { user, organization: { id: 'default' }, session, jwt: await bearer(token), personal: await bearer(personal) }
}

describe.skipIf(!ready)("sign-in on the app's own Kysely", () => {
  it('sends the queries of sign-in, sessions, tokens, personal access tokens and memberships through its plugins', async () => {
    const app = await serve()
    const { user, organization, session, jwt, personal } = await signInFlow(app)
    expect(session.user.id).toBe(user.id)
    expect([jwt.user.id, jwt.tenant, personal.user.id, personal.tenant]).toEqual([user.id, organization.id, user.id, organization.id])
    for (const table of ['user', 'account', 'session', 'jwks', 'organization', 'member', 'personal_access_token']) expect(app.seen.has(table), table).toBe(true)
  })

  it('lets its plugins rewrite those queries, such as to tables of other names', async () => {
    const renamed = { session: 'app_session', member: 'app_member', personal_access_token: 'app_personal_access_token' }
    const app = await serve(renamed)
    await app.store.exec(Object.entries(renamed).map(([from, to]) => `alter table ${from} rename to ${to}`).join('; '))
    const { user, organization, personal } = await signInFlow(app)
    expect([personal.user.id, personal.tenant]).toEqual([user.id, organization.id])
    const counts = await app.store.db
      .selectNoFrom((eb) => Object.values(renamed).map((table) => eb.selectFrom(table).select(eb.fn.countAll<string>().as('n')).as(table)))
      .executeTakeFirstOrThrow()
    // Ana's memberships: the organization she made and the default one.
    expect(counts).toEqual({ app_session: '1', app_member: '2', app_personal_access_token: '1' })
    // The store's own SQL maps its tables too: ending a device's sessions deletes the row of the renamed table.
    const { id } = await app.store.db.selectFrom('app_session').select('id').executeTakeFirstOrThrow()
    await app.store.db.insertInto('device_session').values({ id: 'd1', session_id: id, account_id: 'device-account', created_at: new Date() }).execute()
    await endDeviceSessions(await app.auth.$context, 'device-account')
    expect(await app.store.db.selectFrom('app_session').select('id').execute()).toEqual([])
  })

  it("reads the record of migrations on plain connections, past the app's plugins", async () => {
    const app = await serve()
    await expect(checkMigrationRecord(app.auth, '0.0.0')).rejects.toThrow(/^The database has no migration recorded in migrations\.history/)
    expect(app.seen.has('history')).toBe(false)
  })
})
