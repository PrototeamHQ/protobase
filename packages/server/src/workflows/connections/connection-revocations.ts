import { sql } from 'kysely'
import { z } from 'zod'
import type { Db } from '@protobase/query'
import type { SealedOutcome, SealedRevocation } from '../../better-auth/connections/sealed-revocation'
import { defineJob } from '../../jobs/define-job'
import { FatalJobError } from '../../jobs/run-job'

const payload = z.object({ revocation: z.string().uuid() })

/**
 * Revokes again the token of a disconnected account its provider did not revoke. The token waits encrypted in a row of
 * its own, never in the job, whose payload outlives it: the job holds only the row's id, and deletes the row once the
 * provider revokes it, once it no longer decrypts, and on the last of its tries, whatever that try did.
 */
export const connectionRevocations = (schema: string, revokeSealed: (revocation: SealedRevocation) => Promise<SealedOutcome>) => {
  const table = sql.id(schema, 'connection_revocations')
  const remove = async (db: Db, id: string) => void (await sql`delete from ${table} where id = ${id}`.execute(db))

  const job = defineJob({
    name: 'workflows.connection-revoke',
    payload,
    retryDelay: '1 minute',
    maxRetryDelay: '1 hour',
    run: async ({ revocation }, { db, job: { attempt, maxAttempts } }) => {
      const { rows } = await sql<SealedRevocation>`select provider, hint, token from ${table} where id = ${revocation}`.execute(db)
      const found = rows[0]
      if (!found) return
      const last = attempt >= maxAttempts
      let outcome: SealedOutcome | undefined
      try {
        outcome = await revokeSealed(found)
      } finally {
        if (outcome === 'revoked' || outcome === 'unreadable' || last) await remove(db, revocation)
      }
      if (outcome === 'unreadable') throw new FatalJobError('The token no longer decrypts with the app secret, or no connection revokes its provider: it is not revoked')
      if (outcome === 'refused') throw new Error(last ? `The provider did not revoke the token in ${maxAttempts} tries: it is dropped` : 'The provider did not revoke the token: it is tried again')
    },
  })

  // The row and its job commit together, so no token waits without a job that removes it.
  const revokeLater = async (db: Db, { provider, hint, token }: SealedRevocation) => {
    await db.transaction().execute(async (trx) => {
      const { rows } = await sql<{ id: string }>`insert into ${table} (provider, hint, token) values (${provider}, ${hint}, ${token}) returning id`.execute(trx)
      await job.enqueue(trx, { revocation: rows[0]!.id }, { delay: '1 minute' })
    })
  }

  return { job, revokeLater }
}
