import { readdir, readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connectServer, databaseUrl, serverReachable } from '../../../scripts/test-db/templates'
import postgres from 'postgres'

// db/migrations/006_price_split.sql against a database as it stood before it: the listings' and search profiles'
// prices move to the purchase price or the rent of what they offered or looked for.
const directory = new URL('../../../examples/property-portal/db/migrations/', import.meta.url)
const reachable = await serverReachable()
const database = `property_portal_migration_${process.pid}`
let sql: postgres.Sql

const migrate = async (files: string[]) => {
  for (const file of files) await sql.unsafe(await readFile(new URL(file, directory), 'utf8'))
}

beforeAll(async () => {
  if (!reachable) return
  const server = connectServer()
  await server.unsafe(`create database "${database}"`)
  await server.end()
  sql = postgres(databaseUrl(database), { max: 1, onnotice: () => {} })
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()
  await migrate(files.filter((file) => file < '006'))
  await sql`
    insert into auth."user" (id, name, email, email_verified) values ('anna', 'Anna', 'anna@example.com', true);
    insert into market.places (id, name, region, country, latitude, longitude) values (1, 'Utrecht', 'Utrecht', 'NL', 52.09, 5.12);
    insert into market.agencies (id, name, place_id, phone, email, website) values (1, 'Makelaar', 1, '+31', 'a@example.com', 'https://example.com');
  `.simple()
  // Ids past those the identity columns hand out, so the inserts after the migration do not collide with them.
  const home = (id: number, offer: string, price: number, status: string) => sql`
    insert into market.listings (id, agency_id, place_id, offer_type, property_type, status, address, postal_code, latitude, longitude, price, living_area, rooms, bedrooms, description, agent_name, agent_phone)
    values (${id}, 1, 1, ${offer}, 'apartment', ${status}, ${`Straat ${id}`}, '3511 AB', 52.09, 5.12, ${price}, 80, 3, 2, 'A home.', 'Agent', '+31')`
  await home(101, 'sale', 400_000, 'sold')
  await home(102, 'rent', 1_600, 'let')
  const profile = (id: number, offer: string, min: number | null, max: number | null) => sql`
    insert into members.search_profiles (id, user_id, name, offer_type, min_price, max_price) values (${id}, 'anna', ${`Search ${id}`}, ${offer}, ${min}, ${max})`
  await profile(101, 'sale', 300_000, 500_000)
  await profile(102, 'rent', null, 2_000)
  // Up to the saved searches, which replace the search profiles (008_saved_searches.sql).
  await migrate(files.filter((file) => file >= '006' && file < '008'))
})

afterAll(async () => {
  if (!reachable) return
  await sql.end()
  const server = connectServer()
  await server.unsafe(`drop database if exists "${database}" with (force)`)
  await server.end()
})

describe.skipIf(!reachable)('the price split migration', () => {
  it("moves a sale's price to its purchase price and a rental's to its rent, and derives the offer from them", async () => {
    const listings = await sql`select id::int, purchase_price::float, rent_price::float, for_sale, for_rent, price_per_m2::float, status::text from market.listings order by id`
    expect(listings).toEqual([
      { id: 101, purchase_price: 400_000, rent_price: null, for_sale: true, for_rent: false, price_per_m2: 5000, status: 'sold' },
      { id: 102, purchase_price: null, rent_price: 1_600, for_sale: false, for_rent: true, price_per_m2: null, status: 'let' },
    ])
  })

  it("moves a search profile's price range to the purchase or the rent range of what it looked for", async () => {
    const profiles = await sql`select id::int, for_sale, for_rent, min_purchase_price::float, max_purchase_price::float, min_rent_price::float, max_rent_price::float from members.search_profiles order by id`
    expect(profiles).toEqual([
      { id: 101, for_sale: true, for_rent: false, min_purchase_price: 300_000, max_purchase_price: 500_000, min_rent_price: null, max_rent_price: null },
      { id: 102, for_sale: false, for_rent: true, min_purchase_price: null, max_purchase_price: null, min_rent_price: null, max_rent_price: 2_000 },
    ])
  })

  it('takes a home offered both ways, and refuses one without a price or let without a rent', async () => {
    const insert = (purchase: number | null, rent: number | null, status = 'available') => sql`
      insert into market.listings (agency_id, place_id, property_type, status, address, postal_code, latitude, longitude, purchase_price, rent_price, living_area, rooms, bedrooms, description, agent_name, agent_phone)
      values (1, 1, 'apartment', ${status}, 'Straat 9', '3511 AB', 52.09, 5.12, ${purchase}, ${rent}, 80, 3, 2, 'A home.', 'Agent', '+31') returning for_sale, for_rent`
    expect(await insert(450_000, 1_500)).toEqual([{ for_sale: true, for_rent: true }])
    await expect(insert(null, null)).rejects.toMatchObject({ constraint_name: 'listings_priced' })
    await expect(insert(450_000, null, 'let')).rejects.toMatchObject({ constraint_name: 'listings_status_offered' })
    await expect(sql`insert into members.search_profiles (user_id, name) values ('anna', 'Nothing')`).rejects.toMatchObject({ constraint_name: 'search_profiles_offer' })
  })
})
