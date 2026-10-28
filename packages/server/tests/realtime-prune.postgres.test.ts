import { Kysely, sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { createAdmin, realtimeRelayMigration } from '@protobase/server'
import { pruneBroadcasts } from '../src/realtime/broadcast-prune'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// Supabase's `realtime.messages`, as the import writes it.
const messagesTable = `
create schema realtime;
create table realtime.messages (topic text not null, extension text not null, payload jsonb, event text, private boolean,
  updated_at timestamp not null default now(), inserted_at timestamp not null default now(), id uuid not null default gen_random_uuid() primary key);
create index messages_broadcasts on realtime.messages (inserted_at) where extension = 'broadcast';
`

const message = (pg: PostgresDatabase, topic: string, extension: string, age: string) =>
  pg.exec(`insert into realtime.messages (topic, extension, payload, event, private, inserted_at) values ('${topic}', '${extension}', '{}', 'e', false, localtimestamp - interval '${age}')`)

const topics = async (pg: PostgresDatabase) =>
  (await sql<{ topic: string }>`select topic from realtime.messages order by topic`.execute(pg.db)).rows.map((row) => row.topic)

// An app with no socket open: no `upgradeWebSocket`, so it serves no realtime at all.
const admin = (pg: PostgresDatabase, report: (error: unknown) => void, processes: 'one' | 'many' = 'one') =>
  createAdmin({ resources: [], db: pg.db, authenticate: () => ({ user: { id: 'admin', roles: ['admin'] } }), files: { storage: false }, realtime: { processes }, options: { onUnhandledError: report } })

describe.skipIf(!(await postgresTemplateReady('empty')))('Pruning the realtime tables with no socket open', () => {
  it('deletes broadcast rows more than 48 hours old, and keeps newer ones and rows that are not broadcasts', async () => {
    const pg = await openPostgresDatabase('empty')
    await pg.exec(messagesTable)
    await message(pg, 'old', 'broadcast', '3 days')
    await message(pg, 'recent', 'broadcast', '1 hour')
    await message(pg, 'presence', 'presence', '3 days')
    const report = vi.fn()
    await admin(pg, report).startRealtimePrune().stop()
    expect(await topics(pg)).toEqual(['presence', 'recent'])
    expect(report).not.toHaveBeenCalled()
  })

  it('keeps a row sent minutes ago at UTC-12 when the pruning session is at UTC+14', async () => {
    const pg = await openPostgresDatabase('empty')
    await pg.exec(messagesTable)
    await pg.db.connection().execute(async (west) => {
      await sql`set time zone 'Etc/GMT+12'`.execute(west)
      await sql`insert into realtime.messages (topic, extension, payload, event, private, inserted_at) values ('west', 'broadcast', '{}', 'e', false, clock_timestamp() - interval '5 minutes')`.execute(west)
    })
    await pg.db.connection().execute(async (east) => {
      await sql`set time zone 'Etc/GMT-14'`.execute(east)
      await pruneBroadcasts(east, 5000)
    })
    expect(await topics(pg)).toEqual(['west'])
  })

  it('deletes a backlog in batches, five rows in batches of 2 over three statements', async () => {
    const pg = await openPostgresDatabase('empty')
    await pg.exec(messagesTable)
    for (const n of [1, 2, 3, 4, 5]) await message(pg, `old${n}`, 'broadcast', '3 days')
    let deletes = 0
    const counted = new Kysely<any>({ dialect: pg.dialect, log: (event) => void (event.query.sql.startsWith('delete from realtime.messages') && (deletes += 1)) })
    await pruneBroadcasts(counted, 5000, 2)
    expect(deletes).toBe(3)
    expect(await topics(pg)).toEqual([])
  })

  it('does nothing, and reports nothing, on a database without realtime.messages', async () => {
    const pg = await openPostgresDatabase('empty')
    const report = vi.fn()
    await admin(pg, report).startRealtimePrune().stop()
    expect(report).not.toHaveBeenCalled()
  })

  it('with processes: many, deletes relay frames older than a minute and rate rows older than 60 s', async () => {
    const pg = await openPostgresDatabase('empty')
    await pg.exec((await realtimeRelayMigration(pg.db))!)
    await pg.exec(`insert into realtime_relay.frames (process, kind, topic, private, event, payload, at) values
      (gen_random_uuid(), 'broadcast', 'old', false, 'e', '{}', now() - interval '2 minutes'),
      (gen_random_uuid(), 'broadcast', 'new', false, 'e', '{}', now())`)
    await pg.exec(`insert into realtime_relay.rates (topic, second, count) values
      ('old', extract(epoch from now())::bigint - 120, 1), ('new', extract(epoch from now())::bigint, 1)`)
    const report = vi.fn()
    await admin(pg, report, 'many').startRealtimePrune().stop()
    expect((await sql<{ topic: string }>`select topic from realtime_relay.frames`.execute(pg.db)).rows).toEqual([{ topic: 'new' }])
    expect((await sql<{ topic: string }>`select topic from realtime_relay.rates`.execute(pg.db)).rows).toEqual([{ topic: 'new' }])
    expect(report).not.toHaveBeenCalled()
  })
})
