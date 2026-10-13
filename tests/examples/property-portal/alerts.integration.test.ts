import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { startJobs, type JobsRuntime, type MailMessage } from '@protobase/server'
import { createDb } from '../../../examples/property-portal/db/kysely'
import * as jobs from '../../../examples/property-portal/jobs'
import { databaseSeeded } from './seeded'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000 })

const seeded = await databaseSeeded()
const db = createDb(4)
const sent: MailMessage[] = []
let runtime: JobsRuntime | undefined

// A member of this test alone, with three saved searches of Utrecht as the listings page saves them: to buy up to
// €500,000, mailed at once; to rent up to €2,000 a month, in the daily digest; and anything there, never mailed.
const user = 'test-alerts-member'
let instant: string
let daily: string
let quiet: string
let utrecht: number
let agency: number

beforeAll(async () => {
  if (!seeded) return
  await sql`insert into auth."user" (id, name, email, email_verified, created_at, updated_at, role) values (${user}, 'Alert test', 'alerts-test@portal.example', true, now(), now(), 'member')`.execute(db)
  utrecht = (await sql<{ id: number }>`select id from market.places where name = 'Utrecht'`.execute(db)).rows[0]!.id
  agency = (await sql<{ id: number }>`select id from market.agencies order by id limit 1`.execute(db)).rows[0]!.id
  const search = async (frequency: string, filter: string) =>
    (await sql<{ id: string }>`insert into members.saved_searches (user_id, name, filter, alert_frequency) values (${user}, ${`Test ${frequency}`}, ${filter}, ${frequency}::members.alert_frequency)
      returning id::text as id`.execute(db)).rows[0]!.id
  const place = `place_id = "${utrecht}"`
  instant = await search('instant', `for_sale = true AND ${place} AND purchase_price >= 0 AND purchase_price <= 500000 AND living_area >= 70 AND living_area <= 400`)
  daily = await search('daily', `for_rent = true AND ${place} AND rent_price >= 0 AND rent_price <= 2000 AND living_area >= 70 AND living_area <= 400`)
  quiet = await search('none', `${place} AND search("Teststraat")`)
  runtime = await startJobs({ db, jobs: Object.values(jobs), pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error }, mailer: { send: async (message) => { sent.push(message) } } })
})

afterAll(async () => {
  await runtime?.stop()
  if (seeded) {
    await sql`delete from market.listings where address like 'Teststraat %'`.execute(db)
    await sql`delete from auth."user" where id = ${user}`.execute(db)
  }
  await db.destroy()
})

const listing = async (address: string, prices: { purchase?: number; rent?: number }, area: number, published: boolean) =>
  (await sql<{ id: string }>`
    insert into market.listings (agency_id, place_id, property_type, address, postal_code, latitude, longitude, purchase_price, rent_price, living_area, rooms, bedrooms, description, agent_name, agent_phone, published_at)
    values (${agency}, ${utrecht}, 'apartment', ${address}, '3511 AB', 52.09, 5.12, ${prices.purchase ?? null}, ${prices.rent ?? null}, ${area}, 3, 2, 'A test home.', 'Test Agent', '+31 6 0000 0000', ${published ? sql`now()` : null})
    returning id::text as id`.execute(db)).rows[0]!.id

const alertsOf = async (search: string) =>
  (await sql<{ listing_id: string; emailed_at: Date | null }>`select listing_id::text as listing_id, emailed_at from members.alerts where saved_search_id = ${search} order by id`.execute(db)).rows

describe.skipIf(!seeded)('alerts for newly published listings', () => {
  it('records an alert for a published listing that fits, and mails it at once for an instant search', async () => {
    const fits = await listing('Teststraat 1', { purchase: 450_000 }, 80, true)
    const tooDear = await listing('Teststraat 2', { purchase: 650_000 }, 80, true)
    await vi.waitFor(async () => expect((await alertsOf(instant))[0]?.emailed_at).toBeInstanceOf(Date), { timeout: 20_000, interval: 200 })
    expect((await alertsOf(instant)).map((alert) => alert.listing_id)).toEqual([fits])
    expect(tooDear).not.toBe(fits)
    const mail = sent.find((message) => message.to === 'alerts-test@portal.example')!
    expect(mail.subject).toBe('New: Teststraat 1, Utrecht')
    expect(mail.text).toContain(`/listings/${fits}`)
    expect(mail.html).toContain(`/listings/${fits}"`)
  })

  it('waits until a draft is published, and records it once however often it is saved', async () => {
    const draft = await listing('Teststraat 3', { purchase: 400_000 }, 90, false)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect((await alertsOf(instant)).map((alert) => alert.listing_id)).not.toContain(draft)
    await sql`update market.listings set published_at = now() where id = ${draft}`.execute(db)
    await vi.waitFor(async () => expect((await alertsOf(instant)).map((alert) => alert.listing_id)).toContain(draft), { timeout: 20_000, interval: 200 })
    await sql`update market.listings set published_at = now() where id = ${draft}`.execute(db)
    await jobs.matchListing.enqueue(db, { listingId: Number(draft) })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect((await alertsOf(instant)).filter((alert) => alert.listing_id === draft)).toHaveLength(1)
  })

  it('keeps a daily search\'s alert for the morning digest, which mails the day\'s alerts in one message', async () => {
    const rental = await listing('Teststraat 4', { rent: 1_500 }, 75, true)
    await vi.waitFor(async () => expect((await alertsOf(daily)).map((alert) => alert.listing_id)).toEqual([rental]), { timeout: 20_000, interval: 200 })
    expect((await alertsOf(daily))[0]!.emailed_at).toBeNull()
    const before = sent.length
    await jobs.emailAlerts.enqueue(db, { userId: user, frequency: 'daily' })
    await vi.waitFor(async () => expect((await alertsOf(daily))[0]!.emailed_at).toBeInstanceOf(Date), { timeout: 20_000, interval: 200 })
    expect(sent.slice(before).map((message) => message.subject)).toEqual(['1 new home fits your searches'])
    expect(sent.at(-1)!.text).toContain('These homes were published since your last digest')
  })

  it('records what a search without email finds, by its search text too, and never mails it', async () => {
    const home = await listing('Teststraat 7', { purchase: 900_000 }, 120, true)
    await vi.waitFor(async () => expect((await alertsOf(quiet)).map((alert) => alert.listing_id)).toContain(home), { timeout: 20_000, interval: 200 })
    await jobs.emailAlerts.enqueue(db, { userId: user, frequency: 'daily' })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect((await alertsOf(quiet)).every((alert) => alert.emailed_at === null)).toBe(true)
    expect(sent.some((message) => message.text.includes('Teststraat 7'))).toBe(false)
  })

  it('alerts both a buyer and a renter to a home offered both ways, each by their own price range', async () => {
    const both = await listing('Teststraat 5', { purchase: 480_000, rent: 1_900 }, 80, true)
    const tooDearToRent = await listing('Teststraat 6', { purchase: 490_000, rent: 2_400 }, 80, true)
    await vi.waitFor(async () => expect((await alertsOf(daily)).map((alert) => alert.listing_id)).toContain(both), { timeout: 20_000, interval: 200 })
    await vi.waitFor(async () => expect((await alertsOf(instant)).map((alert) => alert.listing_id)).toEqual(expect.arrayContaining([both, tooDearToRent])), { timeout: 20_000, interval: 200 })
    expect((await alertsOf(daily)).map((alert) => alert.listing_id)).not.toContain(tooDearToRent)
    // The buyer hears of it at once, with both prices.
    await vi.waitFor(() => expect(sent.find((message) => message.text.includes('Teststraat 5'))?.text).toContain('For sale: €480,000 or for rent: €1,900 a month, 80 m²'), { timeout: 20_000, interval: 200 })
  })
})
