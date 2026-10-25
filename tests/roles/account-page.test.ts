import { describe, expect, it } from 'vitest'
import { accountTabs, Card, Page, page, Passkeys, RecordCard, Tab, Tabs, type LayoutNode, type PageModel } from '@protobase/layout'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin } from '@protobase/server'
import { as, testAuthenticator } from '../../test-support/server'

const roles = defineRoles<'notes'>({ admin: ['*'], member: [], anonymous: [] })
const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id)
const overview = page('overview', Page({ title: 'Overview', children: Card({ title: 'Hello' }) }))

// No request here reads a row: /meta comes from the config and the caller's roles alone.
const admin = (pages = [overview]) => createAdmin({ resources: [notes], pages, db: {} as never, authenticate: testAuthenticator, options: { roles } })

type Meta = { pages: PageModel[]; account?: PageModel }
const meta = async (app: ReturnType<typeof admin>, headers: Record<string, string> = {}) => (await (await app.request('/api/meta', { headers })).json()) as Meta
const tabs = (model: PageModel | undefined) => (model?.tree.children[0] as LayoutNode | undefined)?.children.map((tab) => (tab as LayoutNode).props.name)

describe('the account page in /meta', () => {
  it('gives everyone signed in the standard account page when the app has none, beside its pages', async () => {
    const body = await meta(admin(), as(undefined, 'member'))
    expect(body.account?.title).toBe('Account')
    expect(tabs(body.account)).toEqual(['profile', 'security', 'devices', 'apps'])
    expect(body.pages.map((entry) => entry.name)).toEqual(['overview'])
  })

  it('gives a visitor no account page', async () => {
    expect((await meta(admin())).account).toBeUndefined()
  })

  it("serves the app's own page named account in its place, pruned for the caller, and not among the pages", async () => {
    const own = page('account', Page({
      title: 'Your account',
      children: Tabs({ children: [Tab({ name: 'security', label: 'Security', children: [Passkeys({})] }), accountTabs.profile, Tab({ name: 'notes', label: 'Notes', children: [RecordCard({ resource: 'notes', recordKey: '1' })] })] }),
    }))
    const app = admin([overview, own])
    const member = await meta(app, as(undefined, 'member'))
    expect(member.account?.title).toBe('Your account')
    expect(tabs(member.account)).toEqual(['security', 'profile'])
    expect(member.pages.map((entry) => entry.name)).toEqual(['overview'])
    expect(tabs((await meta(app, as(undefined, 'admin'))).account)).toEqual(['security', 'profile', 'notes'])
  })

  it("checks the app's account page against the resources at startup", () => {
    const own = page('account', Page({ title: 'Account', children: RecordCard({ resource: 'orders', recordKey: '1' }) }))
    expect(() => admin([own])).toThrow(/orders/)
  })
})
