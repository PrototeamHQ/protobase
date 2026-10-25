import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Page, page, Settings, Tab, Tabs, type LayoutNode, type PageModel } from '@protobase/layout'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin } from '@protobase/server'
import { signTestToken, testAuthenticator } from '../../test-support/server'
import { openSnapshotDb } from '../../test-support/sql-snapshot'

const roles = defineRoles<'preferences'>({
  admin: ['*'],
  member: ['preferences.read.own', 'preferences.create.own', 'preferences.update.own'],
})

const preferences = resource('preferences')
  .table('preferences')
  .fields({ user_id: f.text(), digest: f.enum(['daily', 'weekly', 'never']).default('weekly'), dark_mode: f.boolean().default(false) })
  .primaryKey((r) => r.user_id)
  .owner((r) => r.user_id)

const account = page('account', Page({ title: 'Account', children: Tabs({ children: Tab({ name: 'privacy', label: 'Privacy', children: Settings({ resource: 'preferences' }) }) }) }))

const as = (id: string, role: string) => ({ authorization: `Bearer ${signTestToken({ sub: id, roles: [role] })}` })
const ann = as('ann', 'member')
const root = as('root', 'admin')

describe('a resource that a Settings block shows', () => {
  let db: Kysely<any>
  let app: ReturnType<typeof createAdmin>
  let plain: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    const pg = await openSnapshotDb('empty')
    await pg.exec(`
      create table preferences (user_id text primary key, digest text not null default 'weekly', dark_mode boolean not null default false);
      insert into preferences (user_id, digest, dark_mode) values ('bob', 'daily', true);
    `)
    db = new Kysely({ dialect: pg.dialect })
    app = createAdmin({ resources: [preferences], pages: [account], db, authenticate: testAuthenticator, options: { roles } })
    plain = createAdmin({ resources: [preferences], db, authenticate: testAuthenticator, options: { roles } })
  })
  afterAll(async () => { await db.destroy() })

  const request = (path: string, headers: Record<string, string>, init: RequestInit = {}, target = app) =>
    target.request(`/api/v1${path}`, { ...init, headers: { 'content-type': 'application/json', ...headers } })
  const items = async (headers: Record<string, string>, target = app) => ((await (await request('/preferences', headers, {}, target)).json()) as { items: Array<Record<string, unknown>> }).items

  it('gives the account page its Settings with every field a person can set', async () => {
    const meta = (await (await app.request('/api/meta', { headers: ann })).json()) as { account: PageModel }
    const tab = meta.account.tree.children[0] as LayoutNode
    expect(((tab.children[0] as LayoutNode).children[0] as LayoutNode).props).toEqual({ resource: 'preferences', fields: ['digest', 'dark_mode'] })
  })

  it("creates a person's own record on their first save, owned by them, and updates it after", async () => {
    expect(await items(ann)).toEqual([])
    const created = await request('/preferences', ann, { method: 'POST', body: JSON.stringify({ digest: 'never' }) })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ user_id: 'ann', digest: 'never', dark_mode: false })
    const updated = await request('/preferences/ann', { ...ann, 'if-match': '*' }, { method: 'PATCH', body: JSON.stringify({ dark_mode: true }) })
    expect(updated.status).toBe(200)
    expect((await items(ann)).map(({ user_id, digest, dark_mode }) => ({ user_id, digest, dark_mode }))).toEqual([{ user_id: 'ann', digest: 'never', dark_mode: true }])
  })

  it('refuses a record owned by someone else', async () => {
    expect((await request('/preferences', ann, { method: 'POST', body: JSON.stringify({ user_id: 'carol', digest: 'daily' }) })).status).toBe(403)
  })

  it("keeps an admin holding * to their own record too, unlike a resource no Settings shows", async () => {
    expect(await items(root)).toEqual([])
    expect((await request('/preferences/bob', root)).status).toBe(404)
    expect((await request('/preferences/bob', { ...root, 'if-match': '*' }, { method: 'PATCH', body: JSON.stringify({ digest: 'never' }) })).status).toBe(404)
    expect((await items(root, plain)).map((item) => item.user_id).sort()).toEqual(['ann', 'bob'])
  })

  it('stops startup on a Settings whose resource is not one record per person', () => {
    const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), user_id: f.text() }).primaryKey((r) => r.id).owner((r) => r.user_id)
    const own = page('account', Page({ title: 'Account', children: Settings({ resource: 'notes' }) }))
    expect(() => createAdmin({ resources: [notes], pages: [own], db: {} as never, authenticate: testAuthenticator, options: { roles: defineRoles({ admin: ['*'] }) } })).toThrow(
      'the owner "user_id" must be the key of notes',
    )
  })
})
