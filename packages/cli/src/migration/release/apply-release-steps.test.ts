import { describe, expect, it } from 'vitest'
import { releaseStepsPlan } from './apply-release-steps'

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
