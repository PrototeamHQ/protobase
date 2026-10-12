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

// A member of this test alone, searching for a sale in Utrecht up to €500,000 and wanting to hear at once, and a
// second profile of theirs in the daily digest, for rent.
const user = 'test-alerts-member'
let instant: string
let daily: string
let utrecht: number
let agency: number

beforeAll(async () => {
  if (!seeded) return
  await sql`insert into auth."user" (id, name, email, email_verified, created_at, updated_at, role) values (${user}, 'Alert test', 'alerts-test@portal.example', true, now(), now(), 'member')`.execute(db)
  utrecht = (await sql<{ id: number }>`select id from market.places where name = 'Utrecht'`.execute(db)).rows[0]!.id
  agency = (await sql<{ id: number }>`select id from market.agencies order by id limit 1`.execute(db)).rows[0]!.id
  const profile = async (offer: string, frequency: string, maxPrice: number) =>
    (await sql<{ id: string }>`insert into members.search_profiles (user_id, name, offer_type, place_id, max_price, min_living_area, alert_frequency) values (${user}, ${`Test ${frequency}`}, ${offer}::market.offer_type, ${utrecht}, ${maxPrice}, 70, ${frequency}::members.alert_frequency) returning id::text as id`.execute(db)).rows[0]!.id
  instant = await profile('sale', 'instant', 500_000)
  daily = await profile('rent', 'daily', 2_000)
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

const listing = async (address: string, offer: string, price: number, area: number, published: boolean) =>
  (await sql<{ id: string }>`
    insert into market.listings (agency_id, place_id, offer_type, property_type, address, postal_code, latitude, longitude, price, living_area, rooms, bedrooms, description, agent_name, agent_phone, published_at)
    values (${agency}, ${utrecht}, ${offer}::market.offer_type, 'apartment', ${address}, '3511 AB', 52.09, 5.12, ${price}, ${area}, 3, 2, 'A test home.', 'Test Agent', '+31 6 0000 0000', ${published ? sql`now()` : null})
    returning id::text as id`.execute(db)).rows[0]!.id

const alertsOf = async (profile: string) =>
  (await sql<{ listing_id: string; emailed_at: Date | null }>`select listing_id::text as listing_id, emailed_at from members.alerts where search_profile_id = ${profile} order by id`.execute(db)).rows

describe.skipIf(!seeded)('alerts for newly published listings', () => {
  it('records an alert for a published listing that fits, and mails it at once to an instant profile', async () => {
    const fits = await listing('Teststraat 1', 'sale', 450_000, 80, true)
    const tooDear = await listing('Teststraat 2', 'sale', 650_000, 80, true)
    await vi.waitFor(async () => expect((await alertsOf(instant))[0]?.emailed_at).toBeInstanceOf(Date), { timeout: 20_000, interval: 200 })
    expect((await alertsOf(instant)).map((alert) => alert.listing_id)).toEqual([fits])
    expect(tooDear).not.toBe(fits)
    const mail = sent.find((message) => message.to === 'alerts-test@portal.example')!
    expect(mail.subject).toBe('New: Teststraat 1, Utrecht')
    expect(mail.text).toContain(`/listings/${fits}`)
  })

  it('waits until a draft is published, and records it once however often it is saved', async () => {
    const draft = await listing('Teststraat 3', 'sale', 400_000, 90, false)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect((await alertsOf(instant)).map((alert) => alert.listing_id)).not.toContain(draft)
    await sql`update market.listings set published_at = now() where id = ${draft}`.execute(db)
    await vi.waitFor(async () => expect((await alertsOf(instant)).map((alert) => alert.listing_id)).toContain(draft), { timeout: 20_000, interval: 200 })
    await sql`update market.listings set published_at = now() where id = ${draft}`.execute(db)
    await jobs.matchListing.enqueue(db, { listingId: Number(draft) })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect((await alertsOf(instant)).filter((alert) => alert.listing_id === draft)).toHaveLength(1)
  })

  it('keeps a daily profile\'s alert for the morning digest, which mails the day\'s alerts in one message', async () => {
    const rental = await listing('Teststraat 4', 'rent', 1_500, 75, true)
    await vi.waitFor(async () => expect((await alertsOf(daily)).map((alert) => alert.listing_id)).toEqual([rental]), { timeout: 20_000, interval: 200 })
    expect((await alertsOf(daily))[0]!.emailed_at).toBeNull()
    const before = sent.length
    await jobs.emailAlerts.enqueue(db, { userId: user, frequency: 'daily' })
    await vi.waitFor(async () => expect((await alertsOf(daily))[0]!.emailed_at).toBeInstanceOf(Date), { timeout: 20_000, interval: 200 })
    expect(sent.slice(before).map((message) => message.subject)).toEqual(['1 new home fits your searches'])
  })
})
