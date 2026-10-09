import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe, expect, it } from 'vitest'
import { Action, Field, Page, RecordCard, Stat, Table, page } from '@protobase/layout'
import { f, resource, userMenu, view } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { configExports } from '../src/resource-source'
import { as, testAuthenticator } from '../../../test-support/server'

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

// One database for every app: none of these tests query it, and each PGlite costs a cold start.
const pg = new PGlite()
const db = () => new Kysely<any>({ dialect: new PGliteDialect(pg) })

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
