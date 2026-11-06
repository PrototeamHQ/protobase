import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { TriggerJobs } from '../triggers/trigger-jobs'

/**
 * The triggers of connected accounts, as sign-in tells of them: a link resumes the triggers waiting on that account's
 * sign-in, which poll again from the cursor they kept or renew the subscription they kept; a disconnect makes the
 * running ones wait for a new sign-in.
 */
export const connectionTriggers = (db: () => Db, schema: string, jobs: Pick<TriggerJobs, 'start'>) => {
  const triggers = sql.id(schema, 'triggers')
  return {
    linked: async (accountId: string) => {
      await db().transaction().execute(async (trx) => {
        const { rows } = await sql<{ id: string; generation: number }>`update ${triggers} set status = 'active', consecutive_failures = 0, last_error = null, updated_at = now()
          where connection_id = ${accountId} and status = 'needs_sign_in' returning id, generation`.execute(trx)
        for (const row of rows) await jobs.start.enqueue(trx, { trigger: row.id, generation: row.generation })
      })
    },
    disconnected: async (accountId: string) => {
      const error = JSON.stringify({ code: 'link_expired', message: 'The connected account was disconnected: its owner connects it again', at: new Date().toISOString() })
      await sql`update ${triggers} set status = 'needs_sign_in', last_error = ${error}::jsonb, poll_job_id = null, poll_attempt = null, next_poll_at = null, updated_at = now()
        where connection_id = ${accountId} and status in ('active', 'failing')`.execute(db())
    },
    needsSignIn: async (accountIds: string[]) => {
      const { rows } = await sql<{ connection_id: string }>`select distinct connection_id from ${triggers} where status = 'needs_sign_in' and connection_id in (${sql.join(accountIds)})`.execute(db())
      return rows.map((row) => row.connection_id)
    },
  }
}
