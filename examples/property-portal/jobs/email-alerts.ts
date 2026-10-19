import { defineJob } from '@protobase/server'
import { appPath } from '@protobase/schema'
import { z } from 'zod'
import { dailyDigest } from '../emails/daily-digest'
import { instantAlert } from '../emails/instant-alert'
import { alertedListings } from './alerted-listings'
import { offeredStatuses } from './offered'

const frequency = z.enum(['instant', 'daily'])

/** The app's public address, for the links in the mail. */
const baseUrl = () => process.env.BETTER_AUTH_URL ?? 'http://localhost:5173'

/** The app as its mails name it: its name (PROTOBASE_APP_NAME), or its host without one. */
const mailingApp = (base: string) => ({ name: process.env.PROTOBASE_APP_NAME || new URL(base).host, url: `${base}/` })

/**
 * Mails a member the alerts due for mail (db/migrations/013_alert_mail.sql) of their searches that now mail with this
 * frequency and have not gone out yet, of listings still on offer (jobs/offered.ts), in one message: the instant alert or
 * the daily digest, each listing once with every search it fits. Then it marks them mailed. Without mail (no
 * PROTOBASE_SMTP_URL) it leaves them for the app to show. A try that fails after sending sends them again on the retry:
 * the mark comes after the send so no alert is marked that never went out.
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
      .select(['a.id', 'l.id as listing_id', 'l.address', 'pl.name as place', 'l.purchase_price', 'l.rent_price', 'l.living_area', 's.id as search_id', 's.name as search'])
      .where('a.user_id', '=', userId)
      .where('a.emailed_at', 'is', null)
      .where('a.mail_due', '=', true)
      .where('l.status', 'in', offeredStatuses)
      .where('s.alert_frequency', '=', frequency)
      .orderBy('a.matched_at')
      .orderBy('a.id')
      .execute()
    if (rows.length === 0) return
    const user = await db.selectFrom('auth.user').select('email').where('id', '=', userId).executeTakeFirst()
    if (!user) return
    const base = baseUrl()
    const data = { app: mailingApp(base), listings: alertedListings(rows, base), searchesUrl: `${base}${appPath({ kind: 'list', resource: 'saved_searches' })}` }
    await (frequency === 'daily' ? dailyDigest.send(user.email, data, mail) : instantAlert.send(user.email, data, mail))
    await db.updateTable('members.alerts').set({ emailed_at: new Date() }).where('id', 'in', rows.map((row) => row.id)).execute()
  },
})
