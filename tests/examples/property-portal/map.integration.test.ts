import { afterAll, describe, expect, it } from 'vitest'
import { configExports, createAdmin, jwtAuthenticator } from '@protobase/server'
import * as config from '../../../examples/property-portal/config'
import { roles } from '../../../examples/property-portal/config/roles'
import { createDb } from '../../../examples/property-portal/db/kysely'
import { databaseSeeded } from './seeded'

const seeded = await databaseSeeded()
const db = createDb(4)
afterAll(async () => { await db.destroy() })

const secret = new TextEncoder().encode('property-portal-map-test-secret-12345')
const { resources, views, pages } = configExports(config)
const app = createAdmin({ resources, views, pages, db, files: { secret: 'property-portal-files-test' }, authenticate: jwtAuthenticator({ keys: async () => secret, algorithms: ['HS256'] }), options: { roles } })

// A visitor, who sends no token, sees the published listings only.
const get = async (path: string) => {
  const response = await app.request(`/api/v1${path}`)
  return { status: response.status, json: (await response.json()) as any }
}
const map = (zoom: number, filter: string) => get(`/listings:map?${new URLSearchParams({ latitude: 'latitude', longitude: 'longitude', zoom: String(zoom), filter })}`)
const total = async (filter: string) => (await get(`/listings?${new URLSearchParams({ filter, page_size: '1', count: 'exact' })}`)).json.total_size as number

const world = 'latitude >= -90 AND latitude <= 90'
const amsterdam = 'latitude >= 52.33 AND latitude <= 52.42 AND longitude >= 4.82 AND longitude <= 4.97'

describe.skipIf(!seeded)('the listings map through the API', () => {
  it('counts the published listings in buckets from far out, as many as the list has', async () => {
    const { status, json } = await map(3, world)
    expect(status).toBe(200)
    expect(json.items).toEqual([])
    expect(json.buckets.length).toBeGreaterThan(1)
    const listed = await total(world)
    expect(listed).toBeGreaterThan(200)
    expect(json.total_size).toBe(listed)
    expect(json.buckets.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0)).toBe(listed)
  })

  it("returns a city's listings themselves, with the fields a visitor reads, combined with the list's filter", async () => {
    const filter = `(for_rent = true) AND ${amsterdam}`
    const { json } = await map(12, filter)
    expect(json.buckets).toEqual([])
    expect(json.items.length).toBeGreaterThan(0)
    expect(json.total_size).toBe(await total(filter))
    expect(json.items.every((item: { for_rent: boolean; latitude: string }) => item.for_rent && Number(item.latitude) >= 52.33)).toBe(true)
    expect(json.items[0]).not.toHaveProperty('agent_phone')
  })

  it('refuses a position a visitor cannot filter by', async () => {
    expect((await get('/listings:map?latitude=agent_phone&longitude=longitude&zoom=3')).status).toBe(400)
  })
})
