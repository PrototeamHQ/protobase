import { defineJob } from '@protobase/server'
import { z } from 'zod'
import { emailAlerts } from './email-alerts'
import { matchesProfile, type ListingFacts, type ProfileCriteria } from './match'

const number = (value: unknown) => (value === null || value === undefined ? null : Number(value))

/**
 * Enqueued by Postgres when a listing is published (db/migrations/005_listing_published.sql): records an alert for each
 * active search profile the listing fits, and has the instant ones mailed. Running it twice records nothing twice.
 */
export const matchListing = defineJob({
  name: 'match-listing',
  payload: z.object({ listingId: z.number().int() }),
  run: async ({ listingId }, { db }) => {
    const row = await db
      .selectFrom('market.listings')
      .select(['id', 'offer_type', 'property_type', 'status', 'place_id', 'latitude', 'longitude', 'price', 'living_area', 'rooms', 'energy_label'])
      .where('id', '=', listingId)
      .where('published_at', 'is not', null)
      .executeTakeFirst()
    // Gone or back to a draft since it was published: nothing to tell anyone.
    if (!row) return
    const listing: ListingFacts = { ...row, latitude: Number(row.latitude), longitude: Number(row.longitude), price: Number(row.price) }

    const profiles = await db
      .selectFrom('members.search_profiles as p')
      .leftJoin('market.places as pl', 'pl.id', 'p.place_id')
      .select(['p.id', 'p.user_id', 'p.alert_frequency', 'p.offer_type', 'p.place_id', 'p.radius_km', 'p.property_type', 'p.min_price', 'p.max_price', 'p.min_living_area', 'p.min_rooms', 'p.min_energy_label', 'pl.latitude', 'pl.longitude'])
      .where('p.active', '=', true)
      .where('p.offer_type', '=', listing.offer_type)
      .execute()
    const fitting = profiles.filter((profile) => {
      const criteria: ProfileCriteria = {
        ...profile,
        centre: profile.latitude === null ? null : { latitude: Number(profile.latitude), longitude: Number(profile.longitude) },
        min_price: number(profile.min_price),
        max_price: number(profile.max_price),
      }
      return matchesProfile(criteria, listing)
    })
    if (fitting.length === 0) return

    const recorded = await db
      .insertInto('members.alerts')
      .values(fitting.map((profile) => ({ user_id: profile.user_id, search_profile_id: profile.id, listing_id: listingId })))
      .onConflict((conflict) => conflict.columns(['search_profile_id', 'listing_id']).doNothing())
      .returning(['user_id', 'search_profile_id'])
      .execute()
    const instant = new Set(fitting.filter((profile) => profile.alert_frequency === 'instant').map((profile) => String(profile.id)))
    const users = new Set(recorded.filter((alert) => instant.has(String(alert.search_profile_id))).map((alert) => alert.user_id as string))
    for (const userId of users) await emailAlerts.enqueue(db, { userId, frequency: 'instant' }, { key: `instant:${userId}` })
  },
})
