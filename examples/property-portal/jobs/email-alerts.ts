import { defineJob } from '@protobase/server'
import { appPath } from '@protobase/schema'
import { z } from 'zod'
import type { AlertedListing } from '../emails/alerted-listing'
import { dailyDigest } from '../emails/daily-digest'
import { instantAlert } from '../emails/instant-alert'

const frequency = z.enum(['instant', 'daily'])

const amount = (value: unknown) => (value === null || value === undefined ? null : String(value))

/** The app's public address, for the links in the mail. */
const baseUrl = () => process.env.BETTER_AUTH_URL ?? 'http://localhost:5173'

/**
 * Mails a member the alerts of their searches with this frequency that have not gone out yet, in one message: the
 * instant alert or the daily digest. Then it marks them mailed. Without mail (no PROTOBASE_SMTP_URL) it leaves them for
 * the app to show. A try that fails after sending sends them again on the retry: the mark comes after the send so no
 * alert is marked that never went out.
 */
export const emailAlerts = defineJob({
  name: 'email-alerts',
  payload: z.object({ userId: z.string().min(1), frequency }),
  retryDelay: '1 minute',
  run: async ({ userId, frequency }, { db, mail }) => {
    if (!mail) return
    const rows = await db
      .selectFrom('members.alerts as a')
      .innerJoin('members.saved_searches as s', 's.id', 'a.saved_search_id')
      .innerJoin('market.listings as l', 'l.id', 'a.listing_id')
      .innerJoin('market.places as pl', 'pl.id', 'l.place_id')
      .select(['a.id', 'l.id as listing_id', 'l.address', 'pl.name as place', 'l.purchase_price', 'l.rent_price', 'l.living_area', 's.name as search'])
      .where('a.user_id', '=', userId)
      .where('a.emailed_at', 'is', null)
      .where('s.alert_frequency', '=', frequency)
      .orderBy('a.matched_at')
      .orderBy('a.id')
      .execute()
    if (rows.length === 0) return
    const user = await db.selectFrom('auth.user').select('email').where('id', '=', userId).executeTakeFirst()
    if (!user) return
    const base = baseUrl()
    const listings = rows.map((row): AlertedListing => ({
      address: row.address,
      place: row.place,
      purchasePrice: amount(row.purchase_price),
      rentPrice: amount(row.rent_price),
      livingArea: row.living_area,
      search: row.search,
      url: `${base}${appPath({ kind: 'record', resource: 'listings', key: String(row.listing_id) })}`,
    }))
    const data = { listings, searchesUrl: `${base}${appPath({ kind: 'list', resource: 'saved_searches' })}` }
    await (frequency === 'daily' ? dailyDigest.send(user.email, data, mail) : instantAlert.send(user.email, data, mail))
    await db.updateTable('members.alerts').set({ emailed_at: new Date() }).where('id', 'in', rows.map((row) => row.id)).execute()
  },
})
