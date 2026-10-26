import { describe, expect, it } from 'vitest'
import { cronJobDeclaration, cronJobModule } from './cron-job-file'

const job = { name: 'purge-done', file: 'purge-done', timezone: undefined, schedule: '0 3 * * *', command: 'delete from public.todos where done' }

/** The string a module's `sql.raw(…)` passes, read as JavaScript reads it. */
const rawSql = (text: string) => new Function(`return ${text.slice(text.indexOf('sql.raw(') + 8, text.lastIndexOf(').execute(db)'))}`)() as string

describe('cronJobModule', () => {
  it("is the job's run: the SQL as the app role", () => {
    expect(cronJobModule(job)).toBe(
      [
        "import { sql } from 'kysely'",
        "import type { JobRun } from '@protobase/server'",
        '',
        "/** pg_cron's job purge-done, imported from Supabase: its SQL, on the schedule protobase.config.ts declares. */",
        'export default (async (_, { db }) => {',
        '  await sql.raw(`delete from public.todos where done`).execute(db)',
        '}) satisfies JobRun',
        '',
      ].join('\n'),
    )
  })

  it('keeps SQL with backticks, backslashes, placeholders and lines as it is', () => {
    const command = "update public.todos set note = `x` || '${y}' || E'a\\nb';\nselect 1"
    expect(rawSql(cronJobModule({ ...job, command }))).toBe(command)
  })
})

describe('cronJobDeclaration', () => {
  it("declares it by its file's name, on its schedule and in pg_cron's time zone, tried once as pg_cron did", () => {
    expect(cronJobDeclaration(job)).toBe("'purge-done': { description: 'pg_cron\\'s job purge-done, imported from Supabase.', schedule: '0 3 * * *', maxAttempts: 1 }")
    expect(cronJobDeclaration({ ...job, timezone: 'Europe/Amsterdam' })).toContain("schedule: '0 3 * * *', timezone: 'Europe/Amsterdam', maxAttempts: 1")
  })
})
