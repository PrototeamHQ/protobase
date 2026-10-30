import { describe, expect, it } from 'vitest'
import { bottomBar, defineRoles, f, resource, view, type BottomBarItemModel, type ListDisplayModel, type SignInViewModel } from '@protobase/schema'
import { createAdmin } from '@protobase/server'
import { as, testAuthenticator } from '../../test-support/server'

const roles = defineRoles<'listings' | 'favorites' | 'notes'>({
  admin: ['*'],
  member: ['listings.read', 'favorites.read.own', 'favorites.create.own', 'favorites.delete.own', 'notes.read'],
  anonymous: [{ 'listings.read': ['address'] }],
})

const listings = resource('listings').table('listings').fields({ id: f.integer().readOnly(), address: f.text() }).primaryKey((r) => r.id)
const favorites = resource('favorites')
  .table('favorites')
  .fields({ id: f.integer().readOnly(), user_id: f.text().readOnly(), listing_id: f.relation('listings').filterable() })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)
const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id)

const prompt = { title: 'Keep the homes you like', description: 'Sign in to save listings.', benefits: ['Find them again on any device'] }
const views = [
  view<typeof listings>('listings').list((r, d) => ({ columns: [r.address], displays: [d.cards({ title: r.address }, { favorite: { resource: 'favorites', field: 'listing_id' } })] })),
  view<typeof favorites>('favorites').names({ singular: 'Favorite', plural: 'Favorites' }).icon('heart').nav({ group: 'Yours', order: 1, recent: { status: 'listing_id', tones: {} } }).listOf((r) => r.listing_id).signIn(prompt),
  view<typeof notes>('notes'),
]
const bottomBars = [
  bottomBar({ label: 'Portal', roles: ['member', 'admin'] }, (m) => [m.resource('listings', { label: 'Listings' }), m.resource('favorites', { label: 'Favorites' })]),
  bottomBar({ label: 'Browse', roles: ['anonymous'] }, (m) => [m.resource('listings', { label: 'Listings' }), m.resource('favorites', { label: 'Favorites' }), m.resource('notes', { label: 'Notes' })]),
]

// No request here reads a row: /meta comes from the config and the caller's roles alone.
const app = createAdmin({ resources: [listings, favorites, notes], views, bottomBars, db: {} as never, authenticate: testAuthenticator, options: { roles } })

type Meta = { signIn?: SignInViewModel[]; bottomBar?: { items: BottomBarItemModel[] }; views: Array<{ resource: string; list?: { displays?: ListDisplayModel[] } }> }
const meta = async (headers: Record<string, string> = {}) => (await (await app.request('/api/meta', { headers })).json()) as Meta
const cards = (body: Meta) => body.views.find((entry) => entry.resource === 'listings')?.list?.displays?.[0]

describe('sign-in prompts in /meta', () => {
  it('tells a visitor about the resources they could use once signed in, keeping them in the bottom bar', async () => {
    const body = await meta()
    expect(body.signIn).toEqual([{ resource: 'favorites', names: { singular: 'Favorite', plural: 'Favorites' }, icon: 'heart', nav: { group: 'Yours', order: 1 }, signIn: prompt }])
    expect(body.bottomBar?.items.map((item) => item.label)).toEqual(['Listings', 'Favorites'])
    expect(cards(body)).toMatchObject({ favorite: { resource: 'favorites', field: 'listing_id' } })
  })

  it('gives a signed-in member the favorite button to use, and no prompts', async () => {
    const body = await meta(as(undefined, 'member'))
    expect(body.signIn).toBeUndefined()
    expect(cards(body)).toMatchObject({ favorite: { resource: 'favorites', field: 'listing_id' } })
  })

  it('leaves the favorite button out for a signed-in caller who cannot save with it', async () => {
    const readers = createAdmin({ resources: [listings, favorites, notes], views, db: {} as never, authenticate: testAuthenticator, options: { roles: defineRoles({ admin: ['*'], reader: ['listings.read'] }) } })
    const body = (await (await readers.request('/api/meta', { headers: as(undefined, 'reader') })).json()) as Meta
    expect(body.signIn).toBeUndefined()
    expect(cards(body)).not.toHaveProperty('favorite')
  })
})
