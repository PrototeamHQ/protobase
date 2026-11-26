import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { ddlText } from '../../packages/server/src/better-auth/store/ddl'
import { watchBaseStatements, watchTrigger } from '../../packages/server/src/better-auth/store/offline/retired-watch'
import { columnId, tableId } from '../../packages/server/src/better-auth/names/identifiers'
import { openPostgresDatabase, postgresTemplateReady } from '../../test-support/postgres-database'

// A write to a retired column counts in the hour it happens, even in a transaction that began in the hour before.
// Postgres cannot move a transaction's start or its clock, but `date_trunc` truncates in the session's TimeZone, so a
// zone offset by whole minutes puts an hour boundary at the next minute: the test waits for it, up to a minute, which
// is why it runs with this suite rather than on every push (retired-watch.test.ts guards the function's text there).
describe.skipIf(!(await postgresTemplateReady('empty')))('the retired watch across an hour boundary', { timeout: 90_000 }, () => {
  it('counts a write after the boundary in the hour it starts, not the hour its transaction began', async () => {
    const database = await openPostgresDatabase('empty')
    const sql = postgres(database.url, { max: 1, onnotice: () => {} })
    const probe = tableId('public', 'probe')
    try {
      await sql`create table probe (id int primary key, watched text)`
      for (const statement of [...watchBaseStatements(), watchTrigger(probe, columnId(probe, 'watched'))]) await sql.unsafe(ddlText(statement))

      const tx = await sql.reserve()
      try {
        await tx`begin`
        // The next whole minute, and the zone east of UTC by the minutes that make it start a local hour.
        const { boundary, zone } = (await tx`select date_trunc('minute', now()) + interval '1 minute' as boundary, format('XXX-00:%s', lpad(((60 - extract(minute from date_trunc('minute', now()) + interval '1 minute')::int) % 60)::text, 2, '0')) as zone`)[0]!
        await tx`select set_config('TimeZone', ${zone}, true)`
        await tx`select pg_sleep(extract(epoch from ${boundary}::timestamptz - clock_timestamp()) + 0.2)`
        await tx`insert into probe (id, watched) values (1, 'set')`
        const counted = await tx`select hour = ${boundary}::timestamptz as exact, hour > now() as after_start, writes::int as writes from retired.writes`
        expect(counted.map((row) => ({ ...row }))).toEqual([{ exact: true, after_start: true, writes: 1 }])
        await tx`rollback`
      } finally {
        tx.release()
      }
    } finally {
      await sql.end()
    }
  })
})
