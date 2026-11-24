import type { Sql } from 'postgres'
import { executeFile, lockKey } from '../apply-migrations'
import type { ReleaseStep } from './release-steps'

/**
 * Applies `steps` in one transaction, behind the lock `migrate` takes, each as `migrate` runs a file, so none commits
 * early: when one fails, such as a check that refuses the rows already there, none is applied.
 */
export const applyReleaseSteps = async (sql: Sql, steps: ReleaseStep[], out: (text: string) => void) => {
  if (steps.length === 0) {
    out('the database is up to date\n')
    return
  }
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${lockKey})`
    for (const step of steps) {
      out(`applying ${step.name}\n`)
      await tx`select set_config('migrations.file', ${step.sql}, true)`
      await tx.unsafe(executeFile)
    }
  })
  out(`applied ${steps.length} steps\n`)
}

/**
 * The steps as one SQL script, each under its title, ending with a comment that says how many there are: what a caller
 * runs in a transaction of its own, which its rollback undoes. It records the auth store's versions itself.
 */
export const releaseStepsPlan = (steps: ReleaseStep[]) => {
  if (steps.length === 0) return '-- the database is up to date\n'
  return `${steps.map(({ name, title, sql }) => `-- ${name}: ${title}.\n${sql.trimEnd()}\n`).join('\n')}\n-- ${steps.length} steps to apply; nothing was applied\n`
}
