import type { EveryOrganization, Organization } from '@protobase/query'
import { IdentifierNode, Kysely, OperationNodeTransformer, type KyselyPlugin, type TableNode } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { checkMigrationRecord } from '../src/migration-record/check-record'
import { runtimeModel } from '../src/migration-record/record-model'
import { plainStoreDb } from '../src/better-auth/store/store-db'
import { appAuthOptions } from '../src/better-auth/auth-settings'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { buildAuth } from '../src/better-auth/create-auth'
import { endDeviceSessions } from '../src/better-auth/platform-device-store'
import { createOrganization } from '../src/better-auth/organizations/host'
import { createUser } from '../src/better-auth/users'
import { storeSqlOf } from '../src/better-auth/store/store-sql'
import type { Mailer } from '../src/mail/mail-message'
import { answerInOrganization, sessionActiveOrganization } from '../src/organization-scope/auth-request-organization'
import { inOrganization, signInOrganization } from '../src/organization-scope/sign-in-organization'
import type { AuthContext } from '../src/better-auth/organizations/store'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'

// Sign-in runs through the app's own Kysely, so a plugin on it sees, and may rewrite, every query of sign-in, sessions,
// tokens, personal access tokens and memberships, the organization scope among them. Rerun on every Better Auth
// upgrade: a query that bypasses the app's Kysely shows here as a table the spy never saw, or as a failure once its
// table is renamed, and one that leaves the organization as a query of its tables without one.
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

// Also keeps the rows each query returns, with the organization sign-in worked in as it ran.
const spy = (renamed: Record<string, string> = {}) => {
  const seen = new Set<string>()
  const returned: { organization: Organization | EveryOrganization; rows: readonly Record<string, unknown>[] }[] = []
  const names = new TableNames(seen, renamed)
  const plugin: KyselyPlugin = {
    transformQuery: ({ node }) => names.transformNode(node),
    transformResult: async ({ result }) => {
      returned.push({ organization: signInOrganization(), rows: result.rows })
      return result
    },
  }
  return { seen, returned, plugin }
}

// A query as it reached the database, after every plugin, with the organization sign-in worked in as it ran.
type SentQuery = { sql: string; parameters: readonly unknown[]; organization: Organization | EveryOrganization }

// The app's sign-in as `serve` builds it, on the app's Kysely with the spy on it, each request in its organization.
const serve = async (renamed: Record<string, string> = {}, mailer?: Mailer) => {
  const store = await openPostgresDatabase('auth')
  const { seen, returned, plugin } = spy(renamed)
  const sent: SentQuery[] = []
  const log = (event: { query: { sql: string; parameters: readonly unknown[] } }) => void sent.push({ sql: event.query.sql, parameters: event.query.parameters, organization: signInOrganization() })
  const db = new Kysely<any>({ dialect: store.dialect, plugins: [plugin], log })
  const auth = await buildAuth(appAuthOptions({ baseURL, secret: 'shared-kysely-test-secret-0123456789', schema: 'public', ...(mailer ? {} : { mailer: false as const }), organizations: { enabled: true, default: { id: 'default', name: 'Default', slug: 'default' } }, personalAccessTokens: { prefix }, signInDevices: true }, { db, ...(mailer && { mailer }) }))
  const answer = answerInOrganization(auth.handler, sessionActiveOrganization(auth))
  const request = (path: string, init: { cookie?: string; body?: unknown } = {}) =>
    answer(
      new Request(`${baseURL}${path}`, {
        method: init.body === undefined ? 'GET' : 'POST',
        headers: { origin: baseURL, ...(init.body !== undefined && { 'content-type': 'application/json' }), ...(init.cookie && { cookie: init.cookie }) },
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      }),
    )
  const authenticate = betterAuthAuthenticator({ auth })
  const bearer = (token: string) => authenticate(new Request(`${baseURL}/api/v1/orders`, { headers: { authorization: `Bearer ${token}` } }))
  return { store, auth, seen, returned, sent, request, bearer }
}

// Signs in a member of an organization, reads the session, and uses a JWT and a personal access token of it. The
// default organization, which turning organizations on made, is not given to her: she starts in the one she makes.
const signInFlow = async ({ auth, request, bearer }: Awaited<ReturnType<typeof serve>>) => {
  const user = await createUser(auth, { email: 'ana@example.com', password, name: 'Ana' })
  const { organization } = await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'ana@example.com' })
  const signedIn = await request('/api/auth/sign-in/email', { body: { email: 'ana@example.com', password } })
  expect(signedIn.status, await signedIn.clone().text()).toBe(200)
  const cookie = signedIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  const session = (await (await request('/api/auth/get-session', { cookie })).json()) as { user: { id: string } }
  const { token } = (await (await request('/api/auth/token', { cookie })).json()) as { token: string }
  const created = await request('/api/auth/account/personal-access-tokens/create', { cookie, body: { name: 'Script' } })
  expect(created.status, await created.clone().text()).toBe(200)
  const { token: personal } = (await created.json()) as { token: string }
  return { user, cookie, organization, session, jwt: await bearer(token), personal: await bearer(personal) }
}

// The queries of the organization's tables: each ran in an organization, whose id it carries, or across them saying why.
const scopedTableQueries = (sent: readonly SentQuery[]) => sent.filter((query) => /"(member|invitation|personal_access_token)"/.test(query.sql))

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
    const { user, cookie, organization, personal } = await signInFlow(app)
    expect([personal.user.id, personal.tenant]).toEqual([user.id, organization.id])
    const counts = await app.store.db
      .selectNoFrom((eb) => Object.values(renamed).map((table) => eb.selectFrom(table).select(eb.fn.countAll<string>().as('n')).as(table)))
      .executeTakeFirstOrThrow()
    // Ana's membership: the organization she made.
    expect(counts).toEqual({ app_session: '1', app_member: '1', app_personal_access_token: '1' })
    // The scope holds on the renamed tables: the member list of her organization leaves out another's members.
    await createUser(app.auth, { email: 'bo@example.com', password, name: 'Bo' })
    await createOrganization(app.auth, { name: 'Other', slug: 'other', owner: 'bo@example.com' })
    const listed = (await (await app.request('/api/auth/organization/list-members', { cookie })).json()) as { members: { userId: string; organizationId: string }[] }
    expect(listed.members.map((member) => [member.userId, member.organizationId])).toEqual([[user.id, organization.id]])
    const { db: storeDb } = storeSqlOf((await app.auth.$context) as unknown as AuthContext)
    const read = await inOrganization(organization.id, () => storeDb.selectFrom('member').select('organization_id').execute())
    expect(read.map((row) => row.organization_id)).toEqual([organization.id])
    const theirs = app.returned.filter(({ organization }) => typeof organization === 'string').flatMap(({ organization, rows }) => rows.filter((row) => 'organization_id' in row && row.organization_id !== organization))
    expect(theirs).toEqual([])
    // The store's own SQL maps its tables too: ending a device's sessions deletes the row of the renamed table.
    const { id } = await app.store.db.selectFrom('app_session').select('id').executeTakeFirstOrThrow()
    await app.store.db.insertInto('device_session').values({ id: 'd1', session_id: id, account_id: 'device-account', created_at: new Date() }).execute()
    await endDeviceSessions(await app.auth.$context, 'device-account')
    expect(await app.store.db.selectFrom('app_session').select('id').execute()).toEqual([])
  })

  it("reads the record of migrations on plain connections, past the app's plugins", async () => {
    const app = await serve()
    await expect(checkMigrationRecord(plainStoreDb(app.auth), runtimeModel(app.auth, {}), '0.0.0')).rejects.toThrow(/^The database has no migration recorded in migrations\.history/)
    expect(app.seen.has('history')).toBe(false)
  })

  it("keeps every query of the organization's tables to one organization, a background task's too, and none of another's rows comes back", async () => {
    let mailed: (rows: { organization: Organization | EveryOrganization; held: string[] }) => void = () => {}
    const background = new Promise<{ organization: Organization | EveryOrganization; held: string[] }>((resolve) => (mailed = resolve))
    // The invitation mail reads the members after the response: Better Auth sends it as a background task.
    const mailer: Mailer = {
      send: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        const { db } = storeSqlOf((await app.auth.$context) as unknown as AuthContext)
        const rows = await db.selectFrom('member').select('organization_id').execute()
        mailed({ organization: signInOrganization(), held: rows.map((row) => String(row.organization_id)) })
        return {}
      },
    }
    const app = await serve({}, mailer)
    const { user, cookie, organization, personal } = await signInFlow(app)
    const bo = await createUser(app.auth, { email: 'bo@example.com', password, name: 'Bo' })
    const other = await createOrganization(app.auth, { name: 'Other', slug: 'other', owner: 'bo@example.com' })
    expect([personal.user.id, personal.tenant]).toEqual([user.id, organization.id])
    const acme = organization.id

    // The member list of the organization she works in, and of one she is no member of.
    const listed = (await (await app.request('/api/auth/organization/list-members', { cookie })).json()) as { members: { userId: string; organizationId: string }[] }
    expect(listed.members.map((member) => [member.userId, member.organizationId])).toEqual([[user.id, acme]])
    const elsewhere = await app.request(`/api/auth/organization/list-members?organizationId=${other.organization.id}`, { cookie })
    expect(elsewhere.status).toBe(403)

    // Her own organizations, across them, and an invitation to Acme, whose mail goes out after the response.
    const organizations = (await (await app.request('/api/auth/organization/list', { cookie })).json()) as { id: string }[]
    expect(organizations.map((entry) => entry.id)).toEqual([acme])
    const invited = await app.request('/api/auth/organization/invite-member', { cookie, body: { organizationId: acme, email: 'cy@example.com', role: 'member' } })
    expect(invited.status, await invited.clone().text()).toBe(200)
    const sentByResponse = app.sent.length
    const mail = await background
    expect(mail).toEqual({ organization: acme, held: [acme] })
    expect(app.sent.length).toBeGreaterThan(sentByResponse)

    const queries = scopedTableQueries(app.sent)
    for (const table of ['member', 'invitation', 'personal_access_token']) expect(queries.some((query) => query.sql.includes(`"${table}"`)), table).toBe(true)
    for (const query of queries) {
      if (typeof query.organization === 'object') expect(query.organization.unscoped, query.sql).not.toBe('')
      else expect(query.parameters, query.sql).toContain(query.organization)
    }
    // A query in an organization returns its rows only: none of Bo's organization, though his rows are in every table.
    const inOrganization = app.returned.filter((query) => typeof query.organization === 'string')
    const theirs = inOrganization.flatMap(({ organization, rows }) => rows.filter((row) => 'organization_id' in row && row.organization_id !== organization))
    expect(inOrganization.some(({ rows }) => rows.some((row) => 'organization_id' in row))).toBe(true)
    expect(theirs).toEqual([])
    const held = await app.store.db.selectFrom('member').select('organization_id').where('user_id', '=', bo.id).execute()
    expect(held.map((row) => row.organization_id)).toEqual([other.organization.id])
  })
})
