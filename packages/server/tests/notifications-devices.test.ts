import { describe, expect, it } from 'vitest'
import { notificationDevicesModule } from '../src/notifications/devices-module'
import { notificationsTargets } from '../src/notifications/notifications-targets'
import { notificationsSchemaSql } from '../src/schema-modules/feature-schemas-sql'
import { DeviceStoreError, postgresDeviceStore } from '../src/notifications/postgres-store'
import type { NotificationsOptions } from '../src/notifications/options'
import { apnsDevice, deviceStoreContract, fcmDevice, relayDevice, webDevice } from '../src/notifications/testing/device-store-contract'
import { memoryHistoryStore } from '../src/notifications/testing/memory-history-store'
import { memoryDeviceStore } from '../src/notifications/testing/memory-store'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// A database with the devices table `protobase migration` writes for the options, without auth.
const migrated = async (options: NotificationsOptions = {}) => {
  const pg = await openSnapshotDb('empty')
  await pg.exec(notificationsSchemaSql(options))
  return pg
}

// What `protobase migration baseline` reads of the devices table for the options, without auth.
const read = (pg: Awaited<ReturnType<typeof migrated>>, options: NotificationsOptions = {}) => notificationDevicesModule.read(pg.db, notificationsTargets(options, undefined).notification_devices!)

deviceStoreContract('in Postgres', async () => postgresDeviceStore((await migrated()).db))

const renamed: NotificationsOptions = {
  schema: 'push',
  devices: { table: 'targets', columns: { id: 'target_id', user_id: 'owner_id', token: 'address', last_seen_at: 'seen_at' } },
}

describe('the devices table', () => {
  it('is written by the migration under the default names, read by the baseline at its last step, and none for a store of the app own', async () => {
    const pg = await openSnapshotDb('empty')
    expect(await read(pg)).toBeUndefined()
    const migration = notificationsSchemaSql()
    expect(migration).toContain('create table "notifications"."devices"')
    expect(migration).not.toContain('default')
    await pg.exec(migration)
    expect(await read(pg)).toEqual({ lastStep: 1, replaceables: {}, names: expect.objectContaining({ schema: 'notifications', table: 'devices', users: '', user_id_type: 'text', 'column.token': 'token' }) })
    expect(notificationsTargets({ store: memoryDeviceStore(), historyStore: memoryHistoryStore() }, undefined)).toEqual({})
  })

  it('is written and used under renamed schema, table and columns', async () => {
    const pg = await migrated(renamed)
    const columns = await pg.query<{ name: string }>(`select column_name as name from information_schema.columns where table_schema = 'push' and table_name = 'targets' order by 1`)
    expect(columns.rows.map(({ name }) => name)).toEqual(['app_id', 'address', 'auth', 'created_at', 'environment', 'kind', 'owner_id', 'p256dh', 'seen_at', 'session_id', 'target_id', 'user_agent'].sort())
    expect(await read(pg, renamed)).toMatchObject({ lastStep: 1 })
    const store = postgresDeviceStore(pg.db, renamed)
    const stored = await store.register('a', webDevice())
    expect(await store.listForUser('a')).toEqual([stored])
  })

  it('is refused by the baseline when written before devices kept their session or could be relay devices, which no step records', async () => {
    const pg = await migrated(renamed)
    await pg.exec('alter table push.targets drop column session_id')
    await expect(read(pg, renamed)).rejects.toThrow('The devices table "push"."targets" was written before devices kept their session and could be relay devices')
    await pg.exec(`alter table push.targets add column session_id text, drop constraint targets_kind_check, drop constraint targets_check,
      add constraint targets_kind_check check (kind in ('web', 'apns', 'fcm')),
      add constraint targets_check check ((kind = 'web' and p256dh is not null and auth is not null and environment is null and app_id is null)
        or (kind = 'apns' and p256dh is null and auth is null and environment is not null and app_id is not null)
        or (kind = 'fcm' and p256dh is null and auth is null and environment is null))`)
    await expect(read(pg, renamed)).rejects.toThrow('was written before devices kept their session and could be relay devices')
  })

  it('is refused by the baseline naming a missing column and a missing unique index on the token', async () => {
    const pg = await migrated()
    await expect(read(pg, { devices: { columns: { user_agent: 'agent' } } })).rejects.toThrow('has no column "agent"')
    await pg.exec('drop index notifications.devices_token_idx')
    await expect(read(pg)).rejects.toThrow('needs a unique index on its token column "token" alone')
  })

  it('keeps NULL in the fields that do not apply, and refuses a record that breaks its kind with no value in the error', async () => {
    const pg = await migrated()
    const store = postgresDeviceStore(pg.db)
    for (const device of [webDevice(), apnsDevice(), fcmDevice(), relayDevice()]) await store.register('a', device)
    const { rows } = await pg.query('select kind, p256dh, auth, environment, app_id, user_agent from notifications.devices order by kind')
    expect(rows).toEqual([
      { kind: 'apns', p256dh: null, auth: null, environment: 'production', app_id: 'net.example.app', user_agent: null },
      { kind: 'fcm', p256dh: null, auth: null, environment: null, app_id: null, user_agent: null },
      { kind: 'relay', p256dh: null, auth: null, environment: null, app_id: null, user_agent: null },
      { kind: 'web', p256dh: webDevice().p256dh, auth: webDevice().auth, environment: null, app_id: null, user_agent: 'Mozilla/5.0' },
    ])
    const broken = { ...webDevice(9), p256dh: null }
    const error = await store.register('a', broken).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DeviceStoreError)
    expect(error).toMatchObject({ sqlState: '23514' })
    expect(JSON.stringify({ ...(error as object), message: (error as Error).message })).not.toContain(broken.token)
    expect(String(error)).not.toContain(broken.auth!)
  })

  it('keeps one record of a token two users register at once, round after round, for each kind', async () => {
    const pg = await migrated()
    const store = postgresDeviceStore(pg.db)
    for (const device of [webDevice(), apnsDevice(), fcmDevice()]) {
      for (let round = 0; round < 10; round++) {
        const answers = await Promise.all([store.register('a', device), store.register('b', { ...device, userAgent: 'B' })])
        // A browser's endpoint stays with whoever holds it, so the other register keeps nothing.
        const kept = answers.flatMap((answer) => (answer ? [answer.token] : []))
        expect(kept).toEqual(device.kind === 'web' ? [device.token] : [device.token, device.token])
      }
      const { rows } = await pg.query<{ holders: number }>('select count(*)::int as holders from notifications.devices where token = $1', [device.token])
      expect(rows).toEqual([{ holders: 1 }])
    }
  })

  it('finds no device by an id that is not one, without asking the database', async () => {
    const store = postgresDeviceStore((await migrated()).db)
    await store.remove('a', 'not-a-uuid')
    expect(await store.listByIds(['not-a-uuid'])).toEqual([])
  })
})
