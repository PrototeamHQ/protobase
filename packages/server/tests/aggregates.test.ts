import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createFixtureDb, createTestApp, type TestApp } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: TestApp
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createTestApp(fixture)
})
afterAll(async () => { await fixture.db.destroy() })

const countWhere = async (condition: string) =>
  Number((await fixture.pg.query<{ n: string }>(`select count(*)::text n from companies where organization_id = 1 and deleted_at is null and ${condition}`)).rows[0]!.n)

const get = (path: string, org = 1) => app.request(`/api/v1${path}`, { headers: as(org) })

describe(':facets', () => {
  it('counts values, ignoring the filter on the faceted field', async () => {
    const body = await (await get('/companies:facets?field=status&filter=status%20%3D%20%22won%22%20AND%20revenue%20%3C%20500')).json()
    expect(body.field).toBe('status')
    expect(body.facets.map((row: { value: string }) => row.value).sort()).toEqual(['lost', 'open', 'won'])
  })

  it('needs a filterable field', async () => {
    expect((await get('/companies:facets')).status).toBe(400)
    expect((await get('/companies:facets?field=notes')).status).toBe(400)
  })
})

describe(':aggregate', () => {
  const sums = async (condition: string) =>
    (await fixture.pg.query<{ status: string; n: string; m: string }>(`select status, count(*)::text n, sum(revenue)::text m from companies where organization_id = 1 and deleted_at is null and ${condition} group by status order by sum(revenue) desc, status`)).rows

  it('counts and adds up per value under the whole filter, largest first', async () => {
    const body = await (await get('/companies:aggregate?group_by=status&sum=revenue&filter=revenue%20%3C%20500')).json()
    expect(body).toEqual({ group_by: 'status', groups: (await sums('revenue < 500')).map((row) => ({ value: row.status, count: Number(row.n), sum: Number(row.m) })) })
    const counted = await (await get('/companies:aggregate?group_by=status&filter=status%20%3D%20%22won%22')).json()
    expect(counted.groups).toEqual([{ value: 'won', count: await countWhere(`status = 'won'`) }])
  })

  it("keeps to the caller's tenant and row filter", async () => {
    const restricted = await (await app.request('/api/v1/companies:aggregate?group_by=status', { headers: as(1, 'sales') })).json()
    expect(restricted.groups).toEqual([{ value: 'open', count: await countWhere(`status = 'open'`) }])
    const other = await (await get('/companies:aggregate?group_by=status&average=revenue', 2)).json()
    expect(other.groups.reduce((sum: number, group: { count: number }) => sum + group.count, 0)).toBe(495)
  })

  it('buckets a date field, empty buckets included, with the measure', async () => {
    const body = await (await get('/companies:aggregate?group_by=createdAt&sum=revenue&from=2026-01-01T00:00:00Z&to=2026-01-04T00:00:00Z&granularity=day')).json()
    expect(body).toMatchObject({ group_by: 'createdAt', granularity: 'day', time_zone: 'UTC' })
    expect(body.groups.map((group: { value: string }) => group.value)).toEqual(['2026-01-01T00:00:00', '2026-01-02T00:00:00', '2026-01-03T00:00:00'])
    // Every company of the first day is deleted, so it has nothing to add up
    expect(body.groups[0]).toEqual({ value: '2026-01-01T00:00:00', count: 0, sum: null })
    const second = (await fixture.pg.query<{ n: string; m: string }>(`select count(*)::text n, sum(revenue)::text m from companies where organization_id = 1 and deleted_at is null and created_at >= '2026-01-02' and created_at < '2026-01-03'`)).rows[0]!
    expect(body.groups[1]).toEqual({ value: '2026-01-02T00:00:00', count: Number(second.n), sum: Number(second.m) })
    const months = await (await get('/companies:aggregate?group_by=createdAt&range=all&granularity=year')).json()
    expect(months.groups).toEqual([{ value: '2026-01-01T00:00:00', count: await countWhere('true') }])
  })

  it('reads the maximum per minute over the last hour, a minute without records holding none', async () => {
    const body = await (await get('/companies:aggregate?group_by=createdAt&maximum=revenue&range=1h&granularity=minute')).json()
    expect(body).toMatchObject({ group_by: 'createdAt', granularity: 'minute' })
    expect(body.groups.length).toBeGreaterThanOrEqual(60)
    expect(body.groups.every((group: { count: number; maximum: null }) => group.count === 0 && group.maximum === null)).toBe(true)
    const day = await (await get('/companies:aggregate?group_by=createdAt&maximum=revenue&from=2026-01-02T00:00:00Z&to=2026-01-03T00:00:00Z&granularity=day')).json()
    const top = (await fixture.pg.query<{ m: string }>(`select max(revenue)::text m from companies where organization_id = 1 and deleted_at is null and created_at >= '2026-01-02' and created_at < '2026-01-03'`)).rows[0]!
    expect(day.groups[0].maximum).toBe(Number(top.m))
  })

  it('splits each bucket of a date field by the values of another field', async () => {
    const body = await (await get('/companies:aggregate?group_by=createdAt&split_by=status&sum=revenue&from=2026-01-02T00:00:00Z&to=2026-01-04T00:00:00Z&granularity=day')).json()
    expect(body).toMatchObject({ group_by: 'createdAt', split_by: 'status', granularity: 'day' })
    const statuses = (await fixture.pg.query<{ status: string }>(`select distinct status from companies where organization_id = 1 and deleted_at is null and created_at >= '2026-01-02' and created_at < '2026-01-04'`)).rows.map((row) => row.status)
    expect(body.splits.map((split: { value: string }) => split.value).sort()).toEqual(statuses.sort())
    for (const group of body.groups) {
      expect(group.splits.reduce((all: number, part: { sum: number }) => all + part.sum, 0)).toBe(group.sum ?? 0)
      expect(group.splits.reduce((all: number, part: { count: number }) => all + part.count, 0)).toBe(group.count)
    }
  })

  it('refuses what it cannot group, add up or apply', async () => {
    const status = async (query: string) => (await get(`/companies:aggregate?${query}`)).status
    expect(await status('')).toBe(400)
    expect(await status('group_by=notes')).toBe(400)
    expect(await status('group_by=status&sum=name')).toBe(400)
    expect(await status('group_by=status&sum=revenue&average=revenue')).toBe(400)
    expect(await status('group_by=status&average=revenue&maximum=revenue')).toBe(400)
    expect(await status('group_by=status&granularity=day')).toBe(400)
    expect(await status('group_by=createdAt&limit=5')).toBe(400)
    expect(await status('group_by=status&split_by=name')).toBe(400)
    expect(await status('group_by=createdAt&split_by=notes')).toBe(400)
    expect(await status('group_by=createdAt&split_limit=3')).toBe(400)
  })
})

describe(':series', () => {
  it('buckets by day with empty buckets and a time zone', async () => {
    const body = await (await get('/companies:series?field=createdAt&from=2026-01-01T00:00:00Z&to=2026-01-08T00:00:00Z&granularity=day&time_zone=Europe/Amsterdam')).json()
    expect(body.points).toHaveLength(8)
    expect(body.points[0]).toEqual({ bucket: '2026-01-01T00:00:00', count: expect.any(Number) })
    expect(body.points.reduce((sum: number, point: { count: number }) => sum + point.count, 0)).toBeGreaterThan(0)
  })

  it('supports relative ranges and all', async () => {
    expect((await (await get('/companies:series?field=createdAt&range=7d')).json()).points.length).toBeGreaterThanOrEqual(7)
    const all = await (await get('/companies:series?field=createdAt&range=all&granularity=month')).json()
    expect(all.points[0].bucket).toBe('2026-01-01T00:00:00')
  })

  it('rejects bad options', async () => {
    expect((await get('/companies:series?field=name&range=7d')).status).toBe(400)
    expect((await get('/companies:series?field=createdAt&granularity=century')).status).toBe(400)
    expect((await get('/companies:series?field=createdAt&time_zone=Mars/Base')).status).toBe(400)
  })
})

describe(':histogram', () => {
  it('buckets a numeric field', async () => {
    const body = await (await get('/companies:histogram?field=revenue&buckets=5')).json()
    expect(body.buckets).toHaveLength(5)
    expect(body.buckets.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0)).toBe(2970)
  })

  it('rejects non-numeric fields', async () => {
    expect((await get('/companies:histogram?field=name')).status).toBe(400)
  })
})

describe(':seek', () => {
  it('returns the page at a row position, and tokens to continue from', async () => {
    const body = await (await get('/companies:seek?order_by=createdAt%20desc&position=500&page_size=3')).json()
    expect(body.items).toHaveLength(3)
    expect(body).not.toHaveProperty('anchors')
    const expected = (await fixture.pg.query<{ id: number }>(`select id from companies where organization_id = 1 and deleted_at is null order by created_at desc, id desc offset 500 limit 3`)).rows.map((row) => row.id)
    expect(body.items.map((item: { id: number }) => item.id).sort()).toEqual(expected.sort())
    const next = await (await get(`/companies?order_by=createdAt%20desc&page_size=3&page_token=${encodeURIComponent(body.next_page_token)}`)).json()
    expect(next.items).toHaveLength(3)
    expect(typeof body.prev_page_token).toBe('string')
  })

  it('applies the filter and an access rule filter, and never shows rows outside the tenant', async () => {
    const won = await (await get('/companies:seek?order_by=id&position=0&page_size=500&fields=id,status&filter=status%20%3D%20%22won%22')).json()
    expect(won.items.every((item: { status: string }) => item.status === 'won')).toBe(true)
    const restricted = await (await app.request('/api/v1/companies:seek?order_by=id&position=0&page_size=500&fields=id,status', { headers: as(1, 'sales') })).json()
    expect(restricted.items.every((item: { status: string }) => item.status === 'open')).toBe(true)
    const other = await (await get('/companies:seek?order_by=id&position=0&page_size=500&fields=id,organizationId', 2)).json()
    expect(other.items.every((item: { organizationId: number }) => item.organizationId === 2)).toBe(true)
  })

  it('needs a position and a sortable field', async () => {
    expect((await get('/companies:seek')).status).toBe(400)
    expect((await get('/companies:seek?position=-1')).status).toBe(400)
    expect((await get('/companies:seek?position=0&order_by=notes')).status).toBe(400)
  })
})
