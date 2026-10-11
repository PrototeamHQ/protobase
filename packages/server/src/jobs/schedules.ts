import { sql } from 'kysely'
import type { PgBoss } from 'pg-boss'
import type { Db } from '@protobase/query'
import { jobsDatabase } from './database'
import type { JobDefinition } from './job-types'
import { isRun, nextRun, runId, scheduleKey } from './schedule'
import { jobsSchema } from './schema'

const job = sql.id(jobsSchema, 'job')

/** The recurring jobs' runs: enqueued ahead, one per time, and kept in step with their schedules. */
export const createSchedules = (boss: PgBoss, db: Db, now: () => Date) => {
  const timezone = (definition: JobDefinition) => definition.options.timezone ?? 'UTC'

  // The run at `at`, unless a worker enqueued it already: its id is the same everywhere.
  const enqueueRun = (definition: JobDefinition, at: Date) =>
    boss.send(definition.name, null as unknown as object, { id: runId(definition.name, at), startAfter: at, singletonKey: scheduleKey, db: jobsDatabase(db) })

  /**
   * Makes the waiting runs match `definitions`: drops those of jobs without a schedule now, and those at a time the
   * schedule no longer has, then enqueues each schedule's next run. A run that is due stays, to run as soon as it can.
   */
  const sync = async (definitions: JobDefinition[]) => {
    const scheduled = definitions.filter((definition) => definition.options.schedule !== undefined)
    await sql`delete from ${job} where singleton_key = ${scheduleKey} and state < 'active' and not (name = any(${scheduled.map(({ name }) => name)}::text[]))`.execute(db)
    for (const definition of scheduled) {
      const waiting = await sql<{ id: string; start_after: Date }>`
        select id, start_after from ${job} where name = ${definition.name} and singleton_key = ${scheduleKey} and state < 'active'`.execute(db)
      const stale = waiting.rows.filter((run) => !isRun(definition.options.schedule!, timezone(definition), new Date(run.start_after))).map((run) => run.id)
      if (stale.length > 0) await sql`delete from ${job} where name = ${definition.name} and id = any(${stale}::uuid[])`.execute(db)
      await enqueueRun(definition, nextRun(definition.options.schedule!, timezone(definition), now()))
    }
  }

  /** As a run starts, the one after it: from its own time, or from now when it ran late, so missed times are skipped. */
  const following = async (definition: JobDefinition, ranAt: Date) => {
    const from = new Date(Math.max(ranAt.getTime(), now().getTime()))
    await enqueueRun(definition, nextRun(definition.options.schedule!, timezone(definition), from))
  }

  return { sync, following }
}
