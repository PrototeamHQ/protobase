import { Kysely } from 'kysely'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { betterAuthAuthenticator, createAdmin, createAuth, createUser } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { bundleBrowserClient } from './support/bundle-client'
import { startHttpServer } from './support/https-server'

const email = 'sam@shop.example'
const password = 'correct horse battery'

// The desk serves tickets, which the shop's admins may read and change but not delete, and agents, which it keeps.
const tickets = resource('tickets')
  .table('tickets')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text().sortable(), status: f.enum(['open', 'closed']).filterable() })
  .primaryKey((r) => r.id)
  .access({ delete: (ctx) => (ctx.user as { roles: string[] }).roles.includes('admin') })
const agents = resource('agents').table('agents').fields({ id: f.integer().readOnly(), name: f.text() }).primaryKey((r) => r.id)
const ticketsView = view<typeof tickets>('tickets').title((r) => r.title).names({ singular: 'Ticket', plural: 'Tickets' }).nav({ group: 'Support' })

// Two apps on two origins: the shop draws the desk's tickets, the desk admits the shop's admins with its own tokens.
describe.skipIf(!(await postgresTemplateReady('auth')))("an app that draws another API's resources, in a browser", () => {
  let shopServer: Awaited<ReturnType<typeof startHttpServer>>
  let deskServer: Awaited<ReturnType<typeof startHttpServer>>
  let shop: string
  let desk: string
  let deskDb: Kysely<any>
  let browser: Browser
  let page: Page
  // Each app's databases, dropped after the file.
  const databases: PostgresDatabase[] = []
  const openDatabase = async (key: 'empty' | 'auth') => {
    const database = await openPostgresDatabase(key)
    databases.push(database)
    return database
  }

  beforeAll(async () => {
    ;[shopServer, deskServer] = await Promise.all([startHttpServer(), startHttpServer()])
    shop = `http://127.0.0.1:${shopServer.port}`
    desk = `http://127.0.0.1:${deskServer.port}`

    const deskPg = await openDatabase('empty')
    await deskPg.exec(`
      create table tickets (id integer generated always as identity primary key, title text not null, status text not null);
      insert into tickets (title, status) values ('Wrong size delivered', 'closed'), ('Parcel never arrived', 'open');
      create table agents (id integer generated always as identity primary key, name text not null);
    `)
    deskDb = deskPg.db
    const deskAuth = createAuth({ database: { dialect: (await openDatabase('auth')).dialect, type: 'postgres' }, baseURL: desk, secret: 'desk-secret-desk-secret-desk-secret-12', roles: ['admin', 'shop'], mailer: false })
    // The desk reads the shop's keys from the shop's own /api/auth/jwks.
    const deskApp = createAdmin({
      resources: [tickets, agents],
      views: [ticketsView],
      db: deskDb,
      auth: deskAuth,
      authenticate: betterAuthAuthenticator({ auth: deskAuth, apps: [{ issuer: shop, roles: { admin: 'shop' } }] }),
      options: { cors: [shop] },
    })
    deskServer.use((request) => deskApp.fetch(request))

    const shopStore = await openDatabase('auth')
    const shopAuth = createAuth({ database: { dialect: shopStore.dialect, type: 'postgres' }, baseURL: shop, secret: 'shop-secret-shop-secret-shop-secret-12', mailer: false })
    await createUser(shopAuth, { email, password })
    const shopApp = createAdmin({
      resources: [],
      db: shopStore.db,
      auth: shopAuth,
      authenticate: betterAuthAuthenticator({ auth: shopAuth }),
      options: { sources: [{ url: `${desk}/api/v1`, label: 'Service desk', resources: ['tickets', 'agents'] }] },
    })
    const script = await bundleBrowserClient('sources-client.ts')
    const html = '<!doctype html><title>Shop</title><script type="module" src="/client.js"></script>'
    shopServer.use((request) => {
      const { pathname } = new URL(request.url)
      if (pathname === '/client.js') return new Response(script, { headers: { 'content-type': 'text/javascript' } })
      if (pathname === '/') return new Response(html, { headers: { 'content-type': 'text/html' } })
      return shopApp.fetch(request)
    })

    browser = await chromium.launch()
    page = await browser.newPage()
    await page.goto(`${shop}/`)
    await page.waitForFunction(() => window.sources !== undefined)
    expect(await page.evaluate(async ([address, secretWord]) => (await window.auth.signIn(address!, secretWord!)).kind, [email, password])).toBe('signed-in')
  })

  afterAll(async () => {
    await browser?.close()
    await Promise.all([shopServer?.close(), deskServer?.close()])
    await Promise.all(databases.map((database) => database.close()))
  })

  it("reads the desk's /meta with the shop's token, scoped to what the shop draws and what its admins may do there", async () => {
    const drawn = await page.evaluate(async () => {
      const [source] = await window.sources.declared()
      return { source, meta: await window.sources.meta(source!) }
    })
    expect(drawn.source).toEqual({ url: `${desk}/api/v1`, label: 'Service desk', resources: ['tickets', 'agents'] })
    expect(drawn.meta.resources.map((model) => model.name)).toEqual(['tickets', 'agents'])
    expect(drawn.meta.views.map((entry) => entry.resource)).toEqual(['tickets'])
    expect(drawn.meta.permissions.tickets).toMatchObject({ read: true, update: true, delete: false })
    // The browser asked the desk first whether the shop's page may send it a token.
    expect(deskServer.requests).toContain(`OPTIONS 127.0.0.1:${deskServer.port}/api/meta`)
  })

  it("lists and changes the desk's tickets from the shop, through one client", async () => {
    const titles = await page.evaluate(async () => {
      const client = await window.sources.client()
      const page = await client.list('tickets', { orderBy: 'id' })
      const { etag } = await client.get('tickets', 2)
      await client.update('tickets', 2, { status: 'closed' }, etag)
      return page.items.map((item) => item.title)
    })
    expect(titles).toEqual(['Wrong size delivered', 'Parcel never arrived'])
    expect(await deskDb.selectFrom('tickets').select('status').where('id', '=', 2).executeTakeFirst()).toEqual({ status: 'closed' })
  })

  it('cannot delete a ticket, which the desk keeps for its own admins', async () => {
    const status = await page.evaluate(async () => {
      const client = await window.sources.client()
      return client.remove('tickets', 1).then(() => 200, (error: { status: number }) => error.status)
    })
    expect(status).toBe(403)
  })
})
