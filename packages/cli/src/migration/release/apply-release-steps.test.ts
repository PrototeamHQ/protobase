import type { Sql } from 'postgres'
import { describe, expect, it } from 'vitest'
import { applyReleaseSteps, releaseStepsPlan } from './apply-release-steps'

// A connection that records each statement of its one transaction, and the order `find` ran in among them.
const recording = () => {
  const calls: string[] = []
  const tx = Object.assign(async (strings: TemplateStringsArray) => calls.push(strings.join('?')), { unsafe: async (text: string) => calls.push(text) })
  const sql = { begin: (run: (t: typeof tx) => Promise<unknown>) => run(tx) } as unknown as Sql
  return { calls, sql }
}

describe('applyReleaseSteps', () => {
  it('finds the steps once the lock is held, then applies each', async () => {
    const { calls, sql } = recording()
    const output: string[] = []
    await applyReleaseSteps(sql, async () => (calls.push('find'), [{ name: 'auth', title: 'Auth', sql: 'select 1;' }]), (text) => output.push(text))
    expect(calls[0]).toContain('pg_advisory_xact_lock')
    expect(calls[1]).toBe('find')
    expect(calls.slice(2)).toEqual(["select set_config('migrations.file', ?, true)", expect.stringContaining("execute current_setting('migrations.file')")])
    expect(output).toEqual(['applying auth\n', 'applied 1 steps\n'])
  })

  it('says the database is up to date when there is nothing to apply', async () => {
    const output: string[] = []
    await applyReleaseSteps(recording().sql, async () => [], (text) => output.push(text))
    expect(output).toEqual(['the database is up to date\n'])
  })
})

describe('releaseStepsPlan', () => {
  it('writes each step under its name and title, then how many there are, as one script', () => {
    const plan = releaseStepsPlan([
      { name: 'auth', title: 'The auth schema changes this version of Protobase needs', sql: 'create table a ();\n\n' },
      { name: 'workflows', title: 'The workflows, their versions, runs and steps', sql: 'create table b ();' },
    ])
    expect(plan).toBe(`-- auth: The auth schema changes this version of Protobase needs.
create table a ();

-- workflows: The workflows, their versions, runs and steps.
create table b ();

-- 2 steps to apply; nothing was applied
`)
  })

  it('says the database is up to date, as a comment, when there is nothing to apply', () => {
    expect(releaseStepsPlan([])).toBe('-- the database is up to date\n')
  })
})
