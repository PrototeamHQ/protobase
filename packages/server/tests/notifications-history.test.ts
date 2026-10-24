import { describe, expect, it } from 'vitest'
import { HistoryStoreError, postgresHistoryStore } from '../src/notifications/postgres-history-store'
import type { NotificationsOptions } from '../src/notifications/options'
import { checkNotificationsSchema, notificationsMigration } from '../src/notifications/schema'
import { historyStoreContract, note } from '../src/notifications/testing/history-store-contract'
import { memoryHistoryStore } from '../src/notifications/testing/memory-history-store'
import { memoryDeviceStore } from '../src/notifications/testing/memory-store'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// A database with the history table `protobase migration` writes for the options, without auth or the devices table.
const migrated = async (options: NotificationsOptions = {}) => {
  const pg = await openSnapshotDb('empty')
  await pg.exec((await notificationsMigration(pg.db, { store: memoryDeviceStore(), ...options }))!)
  return pg
}

historyStoreContract('in Postgres', async () => postgresHistoryStore((await migrated()).db))

const renamed: NotificationsOptions = {
  schema: 'push',
  store: memoryDeviceStore(),
  history: { table: 'inbox', columns: { id: 'entry_id', user_id: 'owner_id', created_at: 'sent_at', read_at: 'seen_at' } },
}

describe('the history table', () => {
  it('is written by the migration beside the devices table, then current, and none for a store of the app own', async () => {
    const pg = await openSnapshotDb('empty')
    await expect(checkNotificationsSchema(pg.db, { store: memoryDeviceStore() })).rejects.toThrow('The history table "notifications"."history" of notifications() is missing. Write it as a migration with `protobase migration`')
    const migration = await notificationsMigration(pg.db)
    expect(migration).toContain('create table "notifications"."devices"')
    expect(migration).toContain('create table "notifications"."history"')
    expect(migration).not.toContain('default')
    await pg.exec(migration!)
    await checkNotificationsSchema(pg.db)
    expect(await notificationsMigration(pg.db)).toBeUndefined()
    const elsewhere = { schema: 'elsewhere', store: memoryDeviceStore(), historyStore: memoryHistoryStore() }
    expect(await notificationsMigration(pg.db, elsewhere)).toBeUndefined()
    await checkNotificationsSchema(pg.db, elsewhere)
  })

  it('is written and used under renamed schema, table and columns', async () => {
    const pg = await migrated(renamed)
    const columns = await pg.query<{ name: string }>(`select column_name as name from information_schema.columns where table_schema = 'push' and table_name = 'inbox' order by 1`)
    expect(columns.rows.map(({ name }) => name)).toEqual(['body', 'data', 'entry_id', 'owner_id', 'seen_at', 'sent_at', 'title', 'url'])
    await checkNotificationsSchema(pg.db, renamed)
    const store = postgresHistoryStore(pg.db, renamed)
    const stored = await store.record('a', note())
    expect(await store.markRead('a', stored.id)).toBe(true)
    expect(await store.list('a', { limit: 5 })).toEqual([{ ...stored, readAt: expect.any(Date) }])
  })

  it('stops startup naming a missing column', async () => {
    const pg = await migrated()
    await expect(checkNotificationsSchema(pg.db, { store: memoryDeviceStore(), history: { columns: { read_at: 'seen' } } })).rejects.toThrow('The history table "notifications"."history" has no column "seen"')
  })

  it('keeps read_at NULL while unread and refuses a row without a user, with no value in the error', async () => {
    const pg = await migrated()
    const store = postgresHistoryStore(pg.db)
    await store.record('a', { title: 'Plain', body: null, url: null, data: null })
    expect((await pg.query('select body, url, data, read_at from notifications.history')).rows).toEqual([{ body: null, url: null, data: null, read_at: null }])
    const refused = await pg.query(`insert into notifications.history (id, user_id, title, created_at) values (gen_random_uuid(), null, 'Secret title', now())`).catch((error: unknown) => error)
    expect(refused).toMatchObject({ code: '23502' })
    const failing = postgresHistoryStore(pg.db, { history: { columns: { title: 'missing' } } })
    const error = await failing.record('a', { ...note(), title: 'Secret title' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HistoryStoreError)
    expect(JSON.stringify({ ...(error as object), message: (error as Error).message })).not.toContain('Secret title')
  })

  it("reads one user's unread count and first page through the indexes", async () => {
    const pg = await migrated()
    await pg.exec(`alter table notifications.history set (autovacuum_enabled = off);
      insert into notifications.history (id, user_id, title, created_at, read_at)
      select gen_random_uuid(), 'user-' || (n % 200), 'Notification', timestamptz '2026-01-01' + n * interval '1 minute', case when n % 3 = 0 then null else timestamptz '2026-06-01' end
      from generate_series(1, 20000) as n;
      analyze notifications.history`)
    const plan = async (query: string) => (await pg.query<{ 'QUERY PLAN': string }>(`explain ${query}`)).rows.map((row) => row['QUERY PLAN']).join('\n')
    const count = await plan(`select count(*) from (select from notifications.history where user_id = 'user-7' and read_at is null limit 100) as unread`)
    const page = await plan(`select * from notifications.history where user_id = 'user-7' order by created_at desc, id desc limit 20`)
    const after = await plan(`select * from notifications.history where user_id = 'user-7' and (created_at, id) < ('2026-01-05', '00000000-0000-4000-8000-000000000000'::uuid) order by created_at desc, id desc limit 20`)
    for (const explained of [count, page, after]) {
      expect(explained).not.toContain('Seq Scan')
      expect(explained).toMatch(/Index/)
    }
  })
})
