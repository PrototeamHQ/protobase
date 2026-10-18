import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bottomBar, defineRoles, f, resource, userMenu, view, type NavRecentModel } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { configExports } from '../src/resource-source'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const isAdmin = (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.includes('admin') ?? false

const tasks = resource('tasks')
  .table('tasks')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text().filterable().sortable(),
    status: f.enum(['open', 'running', 'done']).filterable().sortable(),
    priority: f.integer().filterable().sortable().access({ read: isAdmin }),
  })
  .primaryKey((r) => r.id)

const billing = resource('billing')
  .table('billing')
  .fields({ id: f.integer().readOnly(), plan: f.text() })
  .primaryKey((r) => r.id)
  .access({ read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin })

const recent = { status: 'status' as const, tones: { open: 'info', running: 'warning', done: 'success' } satisfies NavRecentModel['tones'], pulse: ['running'], filter: 'status != "done"' }
const menu = userMenu((m) => [m.resource('billing', { label: 'Billing', icon: 'credit-card' }), m.link('Support', 'mailto:help@example.test')])

let db: Kysely<any>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table tasks (id integer generated always as identity primary key, title text not null, status text not null, priority integer not null);
    create table billing (id integer generated always as identity primary key, plan text not null);
  `)
  db = new Kysely({ dialect: pg.dialect })
})
afterAll(async () => { await db.destroy() })

const admin = (views: ReturnType<typeof view<typeof tasks>>[], withMenu = true) =>
  createAdmin({ resources: [tasks, billing], views, ...(withMenu && { userMenu: menu }), db, authenticate: testAuthenticator })

const metaFor = async (app: ReturnType<typeof admin>, roles: string) => (await app.request('/api/meta', { headers: as(1, roles) })).json()

describe('user menu in /meta', () => {
  it('lists every item for a caller who can see the resources', async () => {
    const body = await metaFor(admin([]), 'admin')
    expect(body.userMenu).toEqual({
      items: [
        { kind: 'resource', resource: 'billing', label: 'Billing', icon: 'credit-card' },
        { kind: 'link', label: 'Support', href: 'mailto:help@example.test' },
      ],
    })
  })

  it('leaves out resources the caller cannot see, and keeps links', async () => {
    const body = await metaFor(admin([]), 'viewer')
    expect(body.resources.map((model: { name: string }) => model.name)).toEqual(['tasks'])
    expect(body.userMenu.items).toEqual([{ kind: 'link', label: 'Support', href: 'mailto:help@example.test' }])
  })

  it('is absent without a userMenu export', async () => {
    expect(await metaFor(admin([], false), 'admin')).not.toHaveProperty('userMenu')
  })

  it('refuses an unknown resource at startup', () => {
    expect(() => createAdmin({ resources: [tasks], userMenu: userMenu((m) => [m.resource('nope')]), db, authenticate: testAuthenticator })).toThrow('User menu: resource "nope" does not exist')
  })
})

describe('bottom bar in /meta', () => {
  const floor = bottomBar({ label: 'Floor', roles: ['viewer', 'admin'] }, (m) => [m.resource('tasks', { label: 'Tasks' }), m.resource('billing', { label: 'Billing' })])
  const office = bottomBar({ label: 'Office', roles: ['clerk'] }, (m) => [m.resource('billing', { label: 'Billing' })])
  const withBars = createAdmin({ resources: [tasks, billing], bottomBars: [floor, office], db, authenticate: testAuthenticator })

  it('gives a caller the bar naming their active role, their first', async () => {
    expect((await metaFor(withBars, 'admin')).bottomBar).toEqual({
      label: 'Floor',
      items: [{ kind: 'resource', resource: 'tasks', label: 'Tasks' }, { kind: 'resource', resource: 'billing', label: 'Billing' }],
    })
    expect((await metaFor(withBars, 'viewer,clerk')).bottomBar.label).toBe('Floor')
    expect(await metaFor(withBars, 'editor,admin')).not.toHaveProperty('bottomBar')
  })

  it('leaves out resources the caller cannot see, and the bar when none is left', async () => {
    expect((await metaFor(withBars, 'viewer')).bottomBar.items).toEqual([{ kind: 'resource', resource: 'tasks', label: 'Tasks' }])
    expect(await metaFor(withBars, 'clerk')).not.toHaveProperty('bottomBar')
  })

  it('is absent for a caller whose roles no bar names', async () => {
    expect(await metaFor(withBars, 'editor')).not.toHaveProperty('bottomBar')
  })

  it('refuses unknown resources, unknown roles and shared roles at startup', () => {
    const start = (bars: ReturnType<typeof bottomBar>[]) => () => createAdmin({ resources: [tasks], bottomBars: bars, db, authenticate: testAuthenticator, options: { roles: defineRoles({ admin: ['*'], viewer: ['*.read'] }) } })
    expect(start([bottomBar({ label: 'Floor', roles: ['viewer'] }, (m) => [m.resource('nope', { label: 'Nope' })])])).toThrow('Bottom bar "Floor": resource "nope" does not exist')
    expect(start([bottomBar({ label: 'Floor', roles: ['ghost'] }, (m) => [m.resource('tasks', { label: 'Tasks' })])])).toThrow('Bottom bar "Floor": role "ghost" is not one of the roles: admin, viewer')
    expect(start([floor, bottomBar({ label: 'Desk', roles: ['viewer'] }, (m) => [m.resource('tasks', { label: 'Tasks' })])])).toThrow('Bottom bars "Floor" and "Desk" both name role "viewer"')
  })
})

describe('nav.recent in /meta', () => {
  it('keeps the group when every field it uses is readable', async () => {
    const body = await metaFor(admin([view<typeof tasks>('tasks').nav({ group: 'Work', recent: { ...recent, orderBy: 'priority desc' } })]), 'admin')
    expect(body.views[0].nav).toEqual({ group: 'Work', recent: { ...recent, orderBy: 'priority desc' } })
  })

  it('drops only the group when its order uses a field the caller cannot read', async () => {
    const body = await metaFor(admin([view<typeof tasks>('tasks').nav({ group: 'Work', recent: { ...recent, orderBy: 'priority desc' } })]), 'viewer')
    expect(body.views[0].nav).toEqual({ group: 'Work' })
    expect(JSON.stringify(body.views[0])).not.toContain('priority')
  })

  it('refuses a group that does not fit the resource at startup', () => {
    expect(() => admin([view<typeof tasks>('tasks').nav({ recent: { ...recent, filter: 'missing = 1' } })])).toThrow(/View "tasks": nav.recent filter: /)
  })
})

describe('configExports', () => {
  it('picks the user menu out of the config module', () => {
    const tasksView = view<typeof tasks>('tasks')
    const found = configExports({ tasks, tasksView, menu })
    expect(found.resources).toEqual([tasks])
    expect(found.views).toEqual([tasksView])
    expect(found.userMenu).toBe(menu)
    expect(configExports({ tasks })).not.toHaveProperty('userMenu')
  })

  it('picks every bottom bar out of the config module, in order', () => {
    const floor = bottomBar({ label: 'Floor', roles: ['viewer'] }, (m) => [m.resource('tasks', { label: 'Tasks' })])
    const office = bottomBar({ label: 'Office', roles: ['admin'] }, (m) => [m.resource('tasks', { label: 'Tasks' })])
    expect(configExports({ tasks, floor, office }).bottomBars).toEqual([floor, office])
    expect(configExports({ tasks }).bottomBars).toEqual([])
  })

  it('refuses two user menus', () => {
    expect(() => configExports({ menu, other: userMenu(() => []) })).toThrow('exports 2 user menus')
  })
})
