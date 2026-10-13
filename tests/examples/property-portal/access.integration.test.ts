import sharp from 'sharp'
import { sql } from 'kysely'
import { SignJWT } from 'jose'
import { afterAll, describe, expect, it } from 'vitest'
import { configExports, createAdmin, jwtAuthenticator } from '@protobase/server'
import * as config from '../../../examples/property-portal/config'
import { roles } from '../../../examples/property-portal/config/roles'
import { createDb } from '../../../examples/property-portal/db/kysely'
import { databaseSeeded } from './seeded'

const seeded = await databaseSeeded()
const db = createDb(4)
afterAll(async () => { await db.destroy() })

const secret = new TextEncoder().encode('property-portal-access-test-secret-1234')
const { resources, views, pages } = configExports(config)
const app = createAdmin({ resources, views, pages, db, files: { secret: 'property-portal-files-test', sharp }, authenticate: jwtAuthenticator({ keys: async () => secret, algorithms: ['HS256'] }), options: { roles } })

// The seeded demo members (seed/builders/member.ts), and a visitor, who sends no token.
const members = { anna: 'seed-anna', bram: 'seed-bram' } as const
type Caller = keyof typeof members | 'visitor'
const tokens = Object.fromEntries(
  await Promise.all(Object.entries(members).map(async ([who, id]) => [who, await new SignJWT({ roles: ['member'] }).setProtectedHeader({ alg: 'HS256' }).setSubject(id).setExpirationTime('15m').sign(secret)])),
) as Record<keyof typeof members, string>

const call = async (who: Caller, path: string, init: { method?: string; body?: unknown } = {}) => {
  const response = await app.request(path.startsWith('/api/') ? path : `/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(who !== 'visitor' && { authorization: `Bearer ${tokens[who]}` }), ...(init.body !== undefined && { 'content-type': 'application/json', 'if-match': '*' }) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  })
  const text = await response.text()
  return { status: response.status, text, json: text ? (JSON.parse(text) as any) : undefined }
}

const firstId = async (table: string, userId: string) =>
  (await sql<{ id: string }>`select id::text as id from ${sql.table(table)} where user_id = ${userId} order by id limit 1`.execute(db)).rows[0]!.id

const ownTables = [['notes', 'members.notes'], ['favorites', 'members.favorites'], ['saved_searches', 'members.saved_searches'], ['alerts', 'members.alerts']] as const

describe.skipIf(!seeded)('a member\'s own data through the API', () => {
  it.each(ownTables)('lists only the asking member\'s %s, all of them', async (resource, table) => {
    for (const [who, id] of Object.entries(members) as Array<[keyof typeof members, string]>) {
      const { json } = await call(who, `/${resource}?page_size=100`)
      const owned = Number((await sql<{ n: string }>`select count(*)::text as n from ${sql.table(table)} where user_id = ${id}`.execute(db)).rows[0]!.n)
      expect(owned, `${who} has ${resource}`).toBeGreaterThan(0)
      expect(json.items).toHaveLength(owned)
      expect(new Set(json.items.map((item: { user_id: string }) => item.user_id))).toEqual(new Set([id]))
    }
  })

  it.each(ownTables)('hides another member\'s %s, to read, change or delete', async (resource, table) => {
    const brams = await firstId(table, members.bram)
    expect((await call('anna', `/${resource}/${brams}`)).status).toBe(404)
    expect((await call('anna', `/${resource}/${brams}`, { method: 'DELETE', body: {} })).status).toBe(404)
    if (resource === 'notes' || resource === 'saved_searches') expect((await call('anna', `/${resource}/${brams}`, { method: 'PATCH', body: resource === 'notes' ? { body: 'Mine now' } : { name: 'Mine now' } })).status).toBe(404)
    expect((await call('bram', `/${resource}/${brams}`)).status).toBe(200)
  })

  it('makes a note its writer\'s, whoever the request names, and lets nobody else see it', async () => {
    const listing = (await sql<{ id: string }>`select id::text as id from market.listings where published_at is not null order by id limit 1`.execute(db)).rows[0]!.id
    const claimed = await call('anna', '/notes', { method: 'POST', body: { listing_id: listing, body: 'Ask about the attic', user_id: members.bram } })
    expect(claimed.status).toBe(400)
    const created = await call('anna', '/notes', { method: 'POST', body: { listing_id: listing, body: 'Ask about the attic' } })
    try {
      expect(created.status, created.text).toBe(201)
      expect(created.json.user_id).toBe(members.anna)
      expect((await call('bram', `/notes/${created.json.id}`)).status).toBe(404)
      const onListing = await call('bram', `/notes?filter=${encodeURIComponent(`listing_id = ${listing}`)}`)
      expect(onListing.json.items.map((note: { id: string }) => note.id)).not.toContain(created.json.id)
    } finally {
      await sql`delete from members.notes where id = ${created.json?.id ?? 0}`.execute(db)
    }
  })

  it('lets a member read and remove their alerts, which only the matching job makes or changes', async () => {
    const id = await firstId('members.alerts', members.anna)
    expect((await call('anna', `/alerts/${id}`)).status).toBe(200)
    expect((await call('anna', `/alerts/${id}`, { method: 'PATCH', body: { emailed_at: null } })).status).toBe(403)
    expect((await call('anna', '/alerts', { method: 'POST', body: { saved_search_id: '1', listing_id: '1' } })).status).toBe(403)
  })

  it("saves a search of the listings as the member's own, once per filter, and refuses a filter the listings do not have", async () => {
    const filter = 'for_rent = true AND garden = true AND search("gracht")'
    const created = await call('anna', '/saved_searches', { method: 'POST', body: { name: 'Canal garden', filter, user_id: members.bram } })
    expect(created.status).toBe(400)
    const saved = await call('anna', '/saved_searches', { method: 'POST', body: { name: 'Canal garden', filter } })
    try {
      expect(saved.status, saved.text).toBe(201)
      expect(saved.json).toMatchObject({ user_id: members.anna, filter, alert_frequency: 'daily' })
      expect((await call('anna', '/saved_searches', { method: 'POST', body: { name: 'Again', filter } })).status).toBe(409)
      const changed = await call('anna', `/saved_searches/${saved.json.id}`, { method: 'PATCH', body: { alert_frequency: 'none', seen_at: '2026-10-12T09:00:00Z' } })
      expect(changed.json).toMatchObject({ alert_frequency: 'none', seen_at: '2026-10-12T09:00:00.000Z' })
      expect((await call('bram', `/saved_searches/${saved.json.id}`)).status).toBe(404)
    } finally {
      await sql`delete from members.saved_searches where id = ${saved.json?.id ?? 0}`.execute(db)
    }
    const wrong = await call('anna', '/saved_searches', { method: 'POST', body: { name: 'Pool', filter: 'swimming_pool = true' } })
    expect(wrong.status).toBe(400)
    expect(wrong.text).toContain('Not a filter of the listings')
  })
})

describe.skipIf(!seeded)('a visitor', () => {
  it('browses the published listings without the agent to call, and sees no draft', async () => {
    const { status, json } = await call('visitor', '/listings?page_size=500')
    expect(status).toBe(200)
    const published = Number((await sql<{ n: string }>`select count(*)::text as n from market.listings where published_at is not null`.execute(db)).rows[0]!.n)
    expect(json.items).toHaveLength(published)
    expect(Object.keys(json.items[0])).not.toContain('agent_phone')
    const draft = (await sql<{ id: string }>`select id::text as id from market.listings where published_at is null order by id limit 1`.execute(db)).rows[0]!.id
    expect((await call('visitor', `/listings/${draft}`)).status).toBe(404)
    expect((await call('visitor', `/listings?filter=${encodeURIComponent('agent_name = "x"')}`)).status).toBe(400)
  })

  it('filters and sorts what it reads, as on the cards', async () => {
    const { status, json } = await call('visitor', `/listings?filter=${encodeURIComponent('for_rent = true AND bedrooms >= 2')}&order_by=rent_price&page_size=5`)
    expect(status).toBe(200)
    expect(json.items.every((item: { for_rent: boolean; rent_price: string | null; bedrooms: number }) => item.for_rent && item.rent_price !== null && item.bedrooms >= 2)).toBe(true)
    const rents = json.items.map((item: { rent_price: string }) => Number(item.rent_price))
    expect(rents).toEqual([...rents].sort((a: number, b: number) => a - b))
  })

  it('finds a home offered both ways under sale and under rent alike', async () => {
    // The listings published before it starts: the alert tests publish more meanwhile.
    const before = new Date().toISOString()
    const offered = async (filter: string) =>
      (await call('visitor', `/listings?filter=${encodeURIComponent(`(${filter}) AND published_at < ${before}`)}&page_size=500`)).json.items.map((item: { id: string }) => String(item.id))
    const both = await offered('for_sale = true AND for_rent = true')
    expect(both.length).toBeGreaterThan(0)
    const forSale = await offered('for_sale = true')
    const forRent = await offered('for_rent = true')
    const either = await offered('for_sale = true OR for_rent = true')
    expect(both.every((id: string) => forSale.includes(id) && forRent.includes(id))).toBe(true)
    expect(either).toHaveLength(forSale.length + forRent.length - both.length)
  })

  it('gets the names of the places and agencies of the listings it browses, in the same answer', async () => {
    const { status, json } = await call('visitor', `/listings?order_by=id&page_size=20&labels=${encodeURIComponent('place_id.name,agency_id.name')}`)
    expect(status).toBe(200)
    const placeIds = [...new Set(json.items.map((item: { place_id: string }) => String(item.place_id)))] as string[]
    const names = await sql<{ id: string; name: string }>`select id::text as id, name from market.places where id::text = any(${placeIds})`.execute(db)
    expect(json.labels.place_id).toEqual(Object.fromEntries(names.rows.map((row) => [row.id, row.name])))
    expect(Object.keys(json.labels.agency_id).length).toBeGreaterThan(0)
  })

  it('finds nothing of the members, and is asked to sign in to change a listing', async () => {
    for (const [resource] of ownTables) expect((await call('visitor', `/${resource}`)).status).toBe(404)
    expect((await call('visitor', '/favorites', { method: 'POST', body: { listing_id: '1' } })).status).toBe(404)
    expect((await call('visitor', '/listings/1', { method: 'PATCH', body: { rent_price: '1.00' } })).status).toBe(401)
  })

  it('gets the admin app\'s meta of what it reads: the catalogue, read-only, and the home page without the member parts', async () => {
    const { status, json } = await call('visitor', '/api/meta')
    expect(status).toBe(200)
    expect(json.resources.map((model: { name: string }) => model.name).sort()).toEqual(['agencies', 'listing_photos', 'listings', 'places'])
    expect(Object.values(json.permissions).every((permission: any) => !permission.create && !permission.update && !permission.delete)).toBe(true)
    const listingsView = json.views.find((view: { resource: string }) => view.resource === 'listings')
    expect(listingsView.actions).toEqual([])
    expect(JSON.stringify(json.pages)).not.toContain('favorites')
  })
})
