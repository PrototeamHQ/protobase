import { defineJob } from '@protobase/server'
import { emailAlerts } from './email-alerts'
import { offeredStatuses } from './offered'

/**
 * Every morning at 7 in Amsterdam: a digest for each member whose daily searches found listings due for mail, not mailed
 * yet and still on offer.
 */
export const dailyAlerts = defineJob({
  name: 'daily-alerts',
  schedule: '0 7 * * *',
  timezone: 'Europe/Amsterdam',
  run: async (_, { db }) => {
    const waiting = await db
      .selectFrom('members.alerts as a')
      .innerJoin('members.saved_searches as s', 's.id', 'a.saved_search_id')
      .innerJoin('market.listings as l', 'l.id', 'a.listing_id')
      .select('a.user_id')
      .distinct()
      .where('a.emailed_at', 'is', null)
      .where('a.mail_due', '=', true)
      .where('l.status', 'in', offeredStatuses)
      .where('s.alert_frequency', '=', 'daily')
      .execute()
    for (const { user_id } of waiting) await emailAlerts.enqueue(db, { userId: user_id, frequency: 'daily' }, { key: `daily:${user_id}` })
  },
})
