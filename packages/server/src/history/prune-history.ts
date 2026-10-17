import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import { defineJob } from '../jobs/define-job'

/** Rows one delete removes, so a first prune of a long history does not hold one long transaction. */
const batchSize = 10_000

/** Deletes the changes older than `days`, in batches; returns how many went. */
export const pruneHistory = async (db: Db, schema: string, days: number) => {
  const table = sql.raw(`${quoteIdent(schema)}."history"`)
  let total = 0
  for (;;) {
    const result = await sql`delete from ${table} where "id" in (select "id" from ${table} where "at" < now() - make_interval(days => ${days}) order by "id" limit ${batchSize})`.execute(db)
    const deleted = Number(result.numAffectedRows ?? 0)
    total += deleted
    if (deleted < batchSize) return total
  }
}

/** The daily job that keeps record history to `days`. */
export const pruneHistoryJob = (schema: string, days: number) =>
  defineJob({
    name: 'history.prune',
    schedule: '41 3 * * *',
    timeout: '30 minutes',
    run: async (_payload, { db }) => void (await pruneHistory(db, schema, days)),
  })
