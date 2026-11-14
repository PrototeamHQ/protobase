import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it } from 'vitest'
import { Action, Box, Composer, Field, Image, Page, RecordCard, Row, Stat, Table, Text, Thread, component, page } from '@protobase/layout'
import { f, resource, userMenu, view } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { defineFunction } from '../src/functions/define-function'
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
      RecordCard({ resource: 'ledger', children: [Field({ source: 'title' }), Field({ source: 'secret' }), Action({ name: 'lock' }), Action({ name: 'rotate' })] }),
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
    expect(card.children.map((node: { props: { source?: string; name?: string } }) => node.props.source ?? node.props.name)).toEqual(['title', 'lock'])
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

// A component a client may not have, which falls back to the record's fields.
const LedgerChart = component('LedgerChart', { fallback: [Field({ source: 'title' }), Field({ source: 'secret' })] })
const charted = page('charted', Page({ title: 'Charted', children: RecordCard({ resource: 'ledger', children: LedgerChart({}) }) }))

describe('a custom component in /meta', () => {
  const chartFor = async (roles: string) => {
    const served = createAdmin({ resources: [ledger], views: [ledgerView], pages: [charted], db: db(), authenticate: testAuthenticator })
    return (await (await served.request('/api/meta', { headers: as(1, roles) })).json()).pages[0].tree.children[0].children[0]
  }

  it('carries its fallback, without what the caller cannot read', async () => {
    expect(await chartFor('admin')).toEqual({ type: 'LedgerChart', props: {}, children: [], custom: true, fallback: [{ type: 'Field', props: { source: 'title' }, children: [] }, { type: 'Field', props: { source: 'secret' }, children: [] }] })
    expect((await chartFor('viewer')).fallback).toEqual([{ type: 'Field', props: { source: 'title' }, children: [] }])
  })
})

// A page too custom for blocks, from plain elements and Tailwind classes.
const styled = page(
  'styled',
  Page({ title: 'Styled', children: [Row({ className: 'items-center gap-3', children: [Box({ className: 'size-3 rounded-full bg-success' }), Text({ as: 'span', children: 'Up' })] }), Table({ resource: 'ledger', className: 'shadow-lg' })] }),
)

describe('Tailwind classes in /meta', () => {
  it('sends the plain elements and every class string as written', async () => {
    const served = createAdmin({ resources: [ledger], pages: [styled], db: db(), authenticate: testAuthenticator })
    const tree = (await (await served.request('/api/meta', { headers: as(1, 'viewer') })).json()).pages[0].tree
    expect(tree.children).toEqual([
      { type: 'Row', props: { className: 'items-center gap-3' }, children: [{ type: 'Box', props: { className: 'size-3 rounded-full bg-success' }, children: [] }, { type: 'Text', props: { as: 'span' }, children: ['Up'] }] },
      { type: 'Table', props: { resource: 'ledger', className: 'shadow-lg' }, children: [] },
    ])
  })
})

// A picture only admins may draw, at the size and theme the client asks.
const systemMap = defineFunction({ roles: ['admin'] }, (request) => {
  const { searchParams } = new URL(request.url)
  return new Response(`${searchParams.get('width')}x${searchParams.get('height')} ${searchParams.get('theme')}`, { headers: { 'content-type': 'image/png' } })
})
const mapped = page('mapped', Page({ title: 'Mapped', children: Image({ function: 'system-map', alt: 'The system map', width: 320, height: 240 }) }))

describe('an image in /meta', () => {
  const served = () => createAdmin({ resources: [ledger], pages: [mapped], functions: { 'system-map': systemMap }, db: db(), authenticate: testAuthenticator })
  const imagesFor = async (roles: string) => (await (await served().request('/api/meta', { headers: as(1, roles) })).json()).pages[0].tree.children

  it('describes it to a caller who may call its function, and leaves it out for one who may not', async () => {
    expect(await imagesFor('admin')).toEqual([{ type: 'Image', props: { function: 'system-map', alt: 'The system map', width: 320, height: 240 }, children: [] }])
    expect(await imagesFor('viewer')).toEqual([])
  })

  it("answers with the function's picture at the asked size and theme, and refuses a caller it does not admit", async () => {
    const asked = '/api/functions/system-map?width=320&height=240&theme=dark'
    const drawn = await served().request(asked, { headers: as(1, 'admin') })
    expect([drawn.headers.get('content-type'), await drawn.text()]).toEqual(['image/png', '320x240 dark'])
    expect((await served().request(asked, { headers: as(1, 'viewer') })).status).toBe(403)
  })

  it('refuses an image whose function the app does not have, at startup', () => {
    expect(() => createAdmin({ resources: [ledger], pages: [mapped], db: db(), authenticate: testAuthenticator })).toThrow('Page "mapped": <Page> › <Image>: no function "system-map"; add functions/system-map.ts')
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
