import { defineJob } from '@protobase/server'
import { z } from 'zod'
import { alertMail, type MailedAlert } from './alert-mail'

const frequency = z.enum(['instant', 'daily'])

/** The app's public address, for the links in the mail. */
const baseUrl = () => process.env.BETTER_AUTH_URL ?? 'http://localhost:5173'

/**
 * Mails a member the alerts of their profiles with this frequency that have not gone out yet, in one message, then marks
 * them mailed. Without mail (no PROTOBASE_SMTP_URL) it leaves them for the app to show. A try that fails after sending
 * sends them again on the retry: the mark comes after the send so no alert is marked that never went out.
 */
export const emailAlerts = defineJob({
  name: 'email-alerts',
  payload: z.object({ userId: z.string().min(1), frequency }),
  retryDelay: '1 minute',
  run: async ({ userId, frequency }, { db, mail }) => {
    if (!mail) return
    const rows = await db
      .selectFrom('members.alerts as a')
      .innerJoin('members.search_profiles as p', 'p.id', 'a.search_profile_id')
      .innerJoin('market.listings as l', 'l.id', 'a.listing_id')
      .innerJoin('market.places as pl', 'pl.id', 'l.place_id')
      .select(['a.id', 'l.id as listing_id', 'l.address', 'pl.name as place', 'l.offer_type', 'l.price', 'l.living_area', 'p.name as profile'])
      .where('a.user_id', '=', userId)
      .where('a.emailed_at', 'is', null)
      .where('p.alert_frequency', '=', frequency)
      .orderBy('a.matched_at')
      .orderBy('a.id')
      .execute()
    if (rows.length === 0) return
    const user = await db.selectFrom('auth.user').select('email').where('id', '=', userId).executeTakeFirst()
    if (!user) return
    const alerts = rows.map((row): MailedAlert => ({ ...row, listing_id: String(row.listing_id), price: String(row.price) }))
    await mail.send(alertMail(user.email, frequency, alerts, baseUrl()))
    await db.updateTable('members.alerts').set({ emailed_at: new Date() }).where('id', 'in', rows.map((row) => row.id)).execute()
  },
})
