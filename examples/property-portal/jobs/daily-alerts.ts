import { defineJob } from '@protobase/server'
import { emailAlerts } from './email-alerts'

/** Every morning at 7 in Amsterdam: a digest for each member whose daily searches found listings not mailed yet. */
export const dailyAlerts = defineJob({
  name: 'daily-alerts',
  schedule: '0 7 * * *',
  timezone: 'Europe/Amsterdam',
  run: async (_, { db }) => {
    const waiting = await db
      .selectFrom('members.alerts as a')
      .innerJoin('members.saved_searches as s', 's.id', 'a.saved_search_id')
      .select('a.user_id')
      .distinct()
      .where('a.emailed_at', 'is', null)
      .where('s.alert_frequency', '=', 'daily')
      .execute()
    for (const { user_id } of waiting) await emailAlerts.enqueue(db, { userId: user_id, frequency: 'daily' }, { key: `daily:${user_id}` })
  },
})
