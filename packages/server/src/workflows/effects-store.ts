import { sql } from 'kysely'
import type { IdempotencyStore } from '../idempotency'

/** The idempotency keys of one run's steps, in the `effects` table of the `workflows` schema. */
export const effectsStore = (schema: string, runId: string): IdempotencyStore => {
  const effects = sql.id(schema, 'effects')
  return {
    // The insert waits for a transaction that holds the key; once it commits, the key is taken and its result readable.
    claim: async (trx, key) => {
      const claimed = await sql`insert into ${effects} (run_id, key) values (${runId}, ${key}) on conflict do nothing returning key`.execute(trx)
      if (claimed.rows.length > 0) return
      const { rows } = await sql<{ result: unknown }>`select result from ${effects} where run_id = ${runId} and key = ${key}`.execute(trx)
      return { result: rows[0]!.result }
    },
    keep: async (trx, key, result) => {
      await sql`update ${effects} set result = ${JSON.stringify(result)}::jsonb where run_id = ${runId} and key = ${key}`.execute(trx)
    },
  }
}
