import { describe, expect, it } from 'vitest'
import { connect } from '../../../examples/property-portal/db/connection'
import { isScale } from '../../../examples/property-portal/seed/scales'
import { buildWorld } from '../../../examples/property-portal/seed/world'
import { databaseSeeded } from './seeded'

const seeded = await databaseSeeded()

// The seed numbers its rows from 1; rows the other test files add while this one runs come after them.
const scaleOf = async (sql: ReturnType<typeof connect>) => {
  const [info] = await sql`select scale from public.seed_info order by seeded_at desc limit 1`
  const scale = String(info!.scale)
  if (!isScale(scale)) throw new Error(`Unknown scale ${scale}`)
  return buildWorld(scale)
}

describe.skipIf(!seeded)('the seeded property portal', () => {
  it('holds what the seed built, at the scale it recorded', async () => {
    const sql = connect({ max: 1 })
    try {
      const world = await scaleOf(sql)
      const count = async (table: string, seededUpTo: number) => Number((await sql.unsafe(`select count(*)::int as n from ${table} where id <= ${seededUpTo}`))[0]!.n)
      expect(await count('market.places', world.places.length)).toBe(world.places.length)
      expect(await count('market.agencies', world.agencies.length)).toBe(world.agencies.length)
      expect(await count('market.listings', world.listings.length)).toBe(world.listings.length)
      expect(await count('members.search_profiles', world.profiles.length)).toBe(world.profiles.length)
      expect(await count('members.alerts', world.alerts.length)).toBe(world.alerts.length)
      const [accounts] = await sql`select count(*)::int as n from auth."user" where id like 'seed-%'`
      expect(accounts!.n).toBe(world.users.length)
    } finally {
      await sql.end()
    }
  })

  it('keeps the rules: computed prices and offers, alerts on published listings only, demo accounts that can sign in', async () => {
    const sql = connect({ max: 1 })
    try {
      const [wrongPrice] = await sql`select count(*)::int as n from market.listings where price_per_m2 is distinct from round(purchase_price / living_area, 2)`
      expect(wrongPrice!.n).toBe(0)
      const offers = await sql`select for_sale, for_rent, count(*)::int as n from market.listings group by 1, 2 order by 1, 2`
      expect(offers.map((row) => [row.for_sale, row.for_rent])).toEqual([[false, true], [true, false], [true, true]])
      const [wrongOffer] = await sql`select count(*)::int as n from market.listings where for_sale <> (purchase_price is not null) or for_rent <> (rent_price is not null)`
      expect(wrongOffer!.n).toBe(0)
      const world = await scaleOf(sql)
      const [onDrafts] = await sql`select count(*)::int as n from members.alerts a join market.listings l on l.id = a.listing_id where a.id <= ${world.alerts.length} and (l.published_at is null or a.matched_at < l.published_at)`
      expect(onDrafts!.n).toBe(0)
      const [notOwners] = await sql`select count(*)::int as n from members.alerts a join members.search_profiles p on p.id = a.search_profile_id where a.user_id <> p.user_id`
      expect(notOwners!.n).toBe(0)
      const accounts = await sql`select u.email from auth.account a join auth."user" u on u.id = a.user_id where a.provider_id = 'credential' and u.id like 'seed-%' order by u.email`
      expect(accounts.map((row) => row.email)).toEqual(['admin@portal.example', 'anna@portal.example', 'bram@portal.example'])
    } finally {
      await sql.end()
    }
  })
})
