import { defineJob } from '@protobase/server'
import { z } from 'zod'
import { readSearchFilter } from '../config/saved_searches/filter'
import { emailAlerts } from './email-alerts'
import { fitsSearch } from './match'

/**
 * Enqueued by Postgres when a listing is published (db/migrations/005_listing_published.sql): records an alert for each
 * saved search the listing fits, and has those of searches that mail at once mailed. Running it twice records nothing
 * twice.
 */
export const matchListing = defineJob({
  name: 'match-listing',
  payload: z.object({ listingId: z.number().int() }),
  run: async ({ listingId }, { db }) => {
    const listing = await db.selectFrom('market.listings').selectAll().where('id', '=', listingId).where('published_at', 'is not', null).executeTakeFirst()
    // Gone or back to a draft since it was published: nothing to tell anyone.
    if (!listing) return

    const searches = await db.selectFrom('members.saved_searches').select(['id', 'user_id', 'filter', 'alert_frequency']).execute()
    const fitting = searches.filter((search) => fitsSearch(readSearchFilter(search.filter), listing))
    if (fitting.length === 0) return

    const recorded = await db
      .insertInto('members.alerts')
      .values(fitting.map((search) => ({ user_id: search.user_id, saved_search_id: search.id, listing_id: listingId })))
      .onConflict((conflict) => conflict.columns(['saved_search_id', 'listing_id']).doNothing())
      .returning(['user_id', 'saved_search_id'])
      .execute()
    const instant = new Set(fitting.filter((search) => search.alert_frequency === 'instant').map((search) => String(search.id)))
    const users = new Set(recorded.filter((alert) => instant.has(String(alert.saved_search_id))).map((alert) => alert.user_id as string))
    for (const userId of users) await emailAlerts.enqueue(db, { userId, frequency: 'instant' }, { key: `instant:${userId}` })
  },
})
