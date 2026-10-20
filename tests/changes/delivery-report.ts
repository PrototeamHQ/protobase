import { sql, type Kysely } from 'kysely'

/**
 * What the dispatch and delivery jobs and the delivery log show now, for a wait on a delivery that timed out: the
 * `changes.dispatch` and `webhooks.deliver` jobs as the queue keeps them, and the log lines since the wait began.
 */
export const deliveryReport = async (db: Kysely<any>, logged: readonly string[], from: number) => {
  const { rows } = await sql`
    select now() as now, name, id, state, retry_count, created_on, start_after, started_on, completed_on, singleton_key, data, output
    from jobs.job where name in ('changes.dispatch', 'webhooks.deliver') order by created_on, id`.execute(db)
  return [`jobs: ${JSON.stringify(rows, null, 2)}`, `logged:\n${logged.slice(from).join('\n')}`].join('\n')
}

/** `wait`, whose failure carries the delivery report, with the lines logged from index `from` on. */
export const reportingDelivery = async (wait: Promise<unknown>, db: Kysely<any>, logged: readonly string[], from: number) =>
  wait.catch(async (error: unknown) => {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${await deliveryReport(db, logged, from)}`, { cause: error })
  })
