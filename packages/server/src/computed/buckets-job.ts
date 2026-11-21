import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { quoteIdent } from '../changes/capture-sql'
import { defineJob } from '../jobs/define-job'
import { bucketsFunctionName } from './buckets-sql'
import { rollupsSchema } from './rollup-sql'

/** The time rollups' refresh: every minute, so a rollup is at most a minute behind its source. */
export const bucketsRefreshSchedule = '* * * * *'

/** Each time rollup's refresh function, and how late its records may arrive, the interval before now it starts at. */
export const bucketsRefreshes = (models: readonly ResourceModel[]) =>
  models.flatMap((model) => (model.buckets ? [{ fn: `${quoteIdent(rollupsSchema)}.${quoteIdent(bucketsFunctionName({ model }))}`, late: model.buckets.late }] : []))

/** Recomputes each time rollup's buckets from `late` before now, one statement per rollup. */
export const refreshBuckets = async (db: Db, refreshes: ReturnType<typeof bucketsRefreshes>) => {
  for (const { fn, late } of refreshes) await sql`select ${sql.raw(fn)}(now() - ${late}::interval)`.execute(db)
}

/**
 * The built-in recurring job that keeps the time rollups up to date. One try a run: a failed run is listed with the
 * failed jobs, and the next minute's run recomputes the same buckets anyway.
 */
export const bucketsRefreshJob = (models: readonly ResourceModel[]) => {
  const refreshes = bucketsRefreshes(models)
  return defineJob({
    name: 'buckets.refresh',
    schedule: bucketsRefreshSchedule,
    maxAttempts: 1,
    run: async (_payload, { db }) => refreshBuckets(db, refreshes),
  })
}
