import { defineJob } from '@protobase/server'
import { emailAlerts } from './email-alerts'

/** Every morning at 7 in Amsterdam: a digest for each member with daily alerts that have not gone out yet. */
export const dailyAlerts = defineJob({
  name: 'daily-alerts',
  schedule: '0 7 * * *',
  timezone: 'Europe/Amsterdam',
  run: async (_, { db }) => {
    const waiting = await db
      .selectFrom('members.alerts as a')
      .innerJoin('members.search_profiles as p', 'p.id', 'a.search_profile_id')
      .select('a.user_id')
      .distinct()
      .where('a.emailed_at', 'is', null)
      .where('p.alert_frequency', '=', 'daily')
      .execute()
    for (const { user_id } of waiting) await emailAlerts.enqueue(db, { userId: user_id, frequency: 'daily' }, { key: `daily:${user_id}` })
  },
})
