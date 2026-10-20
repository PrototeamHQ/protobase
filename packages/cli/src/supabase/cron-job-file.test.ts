import { describe, expect, it } from 'vitest'
import { cronJobModule } from './cron-job-file'

const job = { name: 'purge-done', file: 'purge-done', exportName: 'purgeDone', timezone: undefined, schedule: '0 3 * * *', command: 'delete from public.todos where done' }

/** The string a module's `sql.raw(…)` passes, read as JavaScript reads it. */
const rawSql = (text: string) => new Function(`return ${text.slice(text.indexOf('sql.raw(') + 8, text.lastIndexOf(').execute(db)'))}`)() as string

describe('cronJobModule', () => {
  it('declares a recurring job that runs the SQL as the app role, tried once', () => {
    expect(cronJobModule(job)).toBe(
      [
        "import { defineJob } from '@protobase/server'",
        "import { sql } from 'kysely'",
        '',
        "/** pg_cron's job purge-done, imported from Supabase: its SQL, on its schedule, tried once each time as pg_cron did. */",
        'export const purgeDone = defineJob({',
        "  name: 'purge-done',",
        "  schedule: '0 3 * * *',",
        '  maxAttempts: 1,',
        '  run: async (_, { db }) => {',
        '    await sql.raw(`delete from public.todos where done`).execute(db)',
        '  },',
        '})',
        '',
      ].join('\n'),
    )
  })

  it("keeps pg_cron's time zone", () => {
    expect(cronJobModule({ ...job, timezone: 'Europe/Amsterdam' })).toContain("  schedule: '0 3 * * *',\n  timezone: 'Europe/Amsterdam',\n")
  })

  it('keeps SQL with backticks, backslashes, placeholders and lines as it is', () => {
    const command = "update public.todos set note = `x` || '${y}' || E'a\\nb';\nselect 1"
    expect(rawSql(cronJobModule({ ...job, command }))).toBe(command)
  })

  it("quotes a name with a quote in it", () => {
    expect(cronJobModule({ ...job, name: "it's" })).toContain("  name: 'it\\'s',\n")
  })
})
