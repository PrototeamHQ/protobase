import type { Sql, TransactionSql } from 'postgres'
import { executeFile, lockKey, lockTaken } from '../apply-migrations'
import type { ReleaseStep } from './release-steps'

/** Finds the steps from the database as the transaction `tx` sees it. */
export type FindSteps = (tx: TransactionSql) => Promise<ReleaseStep[]>

/**
 * Applies the steps `find` gives in one transaction, behind the lock `migrate` takes, refusing while another run holds
 * it, each as `migrate` runs a file, so none commits early: when one fails, such as a check that refuses the rows
 * already there, none is applied. `find` runs once the lock is held, so it finds the steps from what is committed.
 */
export const applyReleaseSteps = async (sql: Sql, find: FindSteps, out: (text: string) => void) => {
  const applied = await sql.begin(async (tx) => {
    const [lock] = await tx<{ locked: boolean }[]>`select pg_try_advisory_xact_lock(${lockKey}) as locked`
    if (!lock!.locked) throw new Error(lockTaken)
    const steps = await find(tx)
    for (const step of steps) {
      out(`applying ${step.name}\n`)
      await tx`select set_config('migrations.file', ${step.sql}, true)`
      await tx.unsafe(executeFile)
    }
    return steps
  })
  out(applied.length > 0 ? `applied ${applied.length} steps\n` : 'the database is up to date\n')
}

/** The steps `find` gives from a read-only transaction, printed as `releaseStepsPlan`: nothing is applied. */
export const planReleaseSteps = async (sql: Sql, find: FindSteps, out: (text: string) => void) => {
  out(releaseStepsPlan(await sql.begin('read only', (tx) => find(tx))))
}

/**
 * The steps as one SQL script, each under its title, ending with a comment that says how many there are: what a caller
 * runs in a transaction of its own, which its rollback undoes. It records the auth store's versions itself.
 */
export const releaseStepsPlan = (steps: ReleaseStep[]) => {
  if (steps.length === 0) return '-- the database is up to date\n'
  return `${steps.map(({ name, title, sql }) => `-- ${name}: ${title}.\n${sql.trimEnd()}\n`).join('\n')}\n-- ${steps.length} steps to apply; nothing was applied\n`
}
