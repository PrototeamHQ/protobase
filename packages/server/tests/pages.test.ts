import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it } from 'vitest'
import { Action, Composer, Field, Page, RecordCard, Stat, Table, Thread, page } from '@protobase/layout'
import { f, resource, userMenu, view } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { configExports } from '../src/resource-source'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const isAdmin = (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.includes('admin') ?? false

const ledger = resource('ledger')
  .table('ledger')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text().filterable().sortable(),
    secret: f.text().filterable().sortable().access({ read: isAdmin }),
    status: f.enum(['open', 'locked']).default('open').filterable(),
  })
  .primaryKey((r) => r.id)

const ledgerView = view<typeof ledger>('ledger').actions((a) => [
  a.update('lock', { label: 'Lock', set: { status: 'locked' } }),
  a.update('rotate', { label: 'Rotate secret', set: { secret: 'new' } }),
])

const overview = page(
  'overview',
  Page({
    title: 'Overview',
    children: [
      Stat({ label: 'Open', resource: 'ledger', filter: "status = 'open'" }),
      Table({ resource: 'ledger', columns: ['title', 'secret'] }),
      RecordCard({ resource: 'ledger', children: [Field({ name: 'title' }), Field({ name: 'secret' }), Action({ name: 'lock' }), Action({ name: 'rotate' })] }),
    ],
  }),
  { nav: { group: 'Books' } },
)

const adminOnly = page('audit', Page({ title: 'Audit' }), { roles: ['admin'] })

// One database for every app: none of these tests query it.
let pg: SnapshotDb
beforeAll(async () => { pg = await openSnapshotDb('empty') })
const db = () => new Kysely<any>({ dialect: pg.dialect })

const app = () => createAdmin({ resources: [ledger], views: [ledgerView], pages: [overview, adminOnly], db: db(), authenticate: testAuthenticator })

const metaFor = async (roles: string) => (await app().request('/api/meta', { headers: as(1, roles) })).json()

describe('pages in /meta', () => {
  it('serves the pages to a caller who may see everything', async () => {
    const body = await metaFor('admin')
    expect(body.pages).toEqual([overview.toModel(), adminOnly.toModel()])
  })

  it('leaves out pages for other roles and what names hidden fields, as the views do', async () => {
    const body = await metaFor('viewer')
    expect(body.pages.map((entry: { name: string }) => entry.name)).toEqual(['overview'])
    const [, table, card] = body.pages[0].tree.children
    expect(table.props.columns).toEqual(['title'])
    expect(card.children.map((node: { props: { name: string } }) => node.props.name)).toEqual(['title', 'lock'])
    expect(body.views[0].actions.map((action: { name: string }) => action.name)).toEqual(['lock'])
  })

  it("keeps a view's record and create destinations on a page only for a caller who may open it", async () => {
    const opensAudit = view<typeof ledger>('ledger').recordOpens({ kind: 'page', page: 'audit' }).createOpens({ kind: 'page', page: 'audit' })
    const audited = createAdmin({ resources: [ledger], views: [opensAudit], pages: [adminOnly], db: db(), authenticate: testAuthenticator })
    const viewFor = async (roles: string) => (await (await audited.request('/api/meta', { headers: as(1, roles) })).json()).views[0]
    expect(await viewFor('admin')).toMatchObject({ recordOpens: { kind: 'page', page: 'audit' }, createOpens: { kind: 'page', page: 'audit' } })
    const refused = await viewFor('viewer')
    expect(refused).not.toHaveProperty('recordOpens')
    expect(refused).not.toHaveProperty('createOpens')
  })
})

// A conversation whose messages anyone signed in reads, and only admins post to.
const messages = resource('messages')
  .table('messages')
  .fields({ id: f.integer().readOnly(), author_id: f.text(), sent_at: f.timestamp().readOnly().sortable(), body: f.text() })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)
  .access({ create: isAdmin })

const chat = page('chat', Page({ title: 'Chat', children: [Thread({ resource: 'messages', sender: 'author_id', time: 'sent_at', text: 'body' }), Composer({ resource: 'messages', field: 'body' })] }))

describe('a conversation in /meta', () => {
  const chatFor = async (roles: string) => {
    const served = createAdmin({ resources: [messages], pages: [chat], db: db(), authenticate: testAuthenticator })
    return (await (await served.request('/api/meta', { headers: as(1, roles) })).json()).pages[0].tree.children
  }

  it('describes the thread and the composer with their resource and fields', async () => {
    expect(await chatFor('admin')).toEqual([
      { type: 'Thread', props: { resource: 'messages', sender: 'author_id', time: 'sent_at', text: 'body' }, children: [] },
      { type: 'Composer', props: { resource: 'messages', field: 'body' }, children: [] },
    ])
  })

  it('leaves out the composer for a caller who cannot post', async () => {
    expect((await chatFor('viewer')).map((node: { type: string }) => node.type)).toEqual(['Thread'])
  })
})

describe('createAdmin with pages', () => {
  it('refuses pages that name what the resources do not have, at startup', () => {
    const broken = page('broken', Page({ title: 'x', children: Table({ resource: 'ledger', columns: ['nope'] }) }))
    expect(() => createAdmin({ resources: [ledger], pages: [broken], db: db(), authenticate: testAuthenticator })).toThrow('Page "broken": <Page> › <Table resource="ledger">: unknown column "nope" on ledger')
  })

  it('refuses an action no view of the resource declares', () => {
    expect(() => createAdmin({ resources: [ledger], pages: [overview], db: db(), authenticate: testAuthenticator })).toThrow('no action "lock" on ledger')
  })

  it('refuses a page at the address of a resource', () => {
    const clash = page('ledger', Page({ title: 'x' }))
    expect(() => createAdmin({ resources: [ledger], pages: [clash], db: db(), authenticate: testAuthenticator })).toThrow('Page "ledger" has the name of a resource')
  })
})

describe('pages in the user menu', () => {
  const menu = userMenu((m) => [m.page('audit', { icon: 'shield' }), m.page('overview')])
  const withMenu = () => createAdmin({ resources: [ledger], views: [ledgerView], pages: [overview, adminOnly], userMenu: menu, db: db(), authenticate: testAuthenticator })

  it('lists the pages the caller gets, and leaves out the others', async () => {
    const forAdmin = await (await withMenu().request('/api/meta', { headers: as(1, 'admin') })).json()
    const forViewer = await (await withMenu().request('/api/meta', { headers: as(1, 'viewer') })).json()
    expect(forAdmin.userMenu.items).toEqual([{ kind: 'page', page: 'audit', icon: 'shield' }, { kind: 'page', page: 'overview' }])
    expect(forViewer.userMenu.items).toEqual([{ kind: 'page', page: 'overview' }])
  })

  it('refuses a page that does not exist, at startup', () => {
    expect(() => createAdmin({ resources: [ledger], userMenu: userMenu((m) => [m.page('nope')]), db: db(), authenticate: testAuthenticator })).toThrow('User menu: page "nope" does not exist')
  })
})

describe('configExports', () => {
  it('tells pages apart from views', () => {
    const { resources, views, pages } = configExports({ ledger, ledgerView, overview })
    expect([resources.length, views.length, pages.map((entry) => entry.name)]).toEqual([1, 1, ['overview']])
  })
})
