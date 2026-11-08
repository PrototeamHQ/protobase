import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { TraceSinkInput } from './trace-sink'

/**
 * One join of a run's trace at a time across workers: a transaction holds the run's advisory lock for the whole join,
 * and names the joined trace on the run as its `trace_file`.
 */
export const traceJoining = (db: () => Db, schema: string): TraceSinkInput['joining'] => (runId, join) =>
  db().transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${schema}.trace:${runId}`}, 0))`.execute(trx)
    await join(async (file) => void (await sql`update ${sql.id(schema, 'runs')} set trace_file = ${file} where id = ${runId}`.execute(trx)))
  })
