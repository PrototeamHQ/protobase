/** The schema the job queue lives in: pg-boss's tables and Protobase's functions. */
export const jobsSchema = 'jobs'

/** The command that writes what the database lacks as the project's next migration. */
export const migrationCommand = 'protobase migration'

/**
 * A pg-boss plan as a migration the project applies in its own transaction: without its BEGIN and COMMIT, without the
 * timeouts it sets for that transaction, which would hold for the project's later migrations too, and with index
 * builds that are not `CONCURRENTLY`, which Postgres refuses in a transaction. Migrations run while nothing else
 * writes, so a plain index build only costs a lock nobody waits on. A pg-boss bump copies the plan it gives into the
 * jobs module's next step (`jobs-module.ts`).
 */
export const migrationStatements = (plan: string) => {
  const match = /^\s*BEGIN;\n\s*SET LOCAL lock_timeout = \d+;\n\s*SET LOCAL idle_in_transaction_session_timeout = \d+;\n([\s\S]*?)\n\s*COMMIT;\n?([\s\S]*)$/.exec(plan)
  if (!match) throw new Error(`Unexpected pg-boss plan:\n${plan.slice(0, 200)}`)
  return `${match[1]!.trim()}\n${match[2]}`.replace(/\b(CREATE (?:UNIQUE )?INDEX|DROP INDEX|REINDEX INDEX) CONCURRENTLY\b/gi, '$1').trim()
}
