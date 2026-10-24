import { describe, expect, it } from 'vitest'
import type { DeviceStore } from './device-store'
import type { HistoryStore } from './history-store'
import { checkNotificationsOptions, historyNames, notificationsNames } from './options'
import { notifications } from './plugin'
import { memoryHistoryStore } from './testing/memory-history-store'
import { memoryDeviceStore } from './testing/memory-store'

describe('notificationsNames', () => {
  it('names the schema notifications and the table devices by default', () => {
    expect(notificationsNames()).toMatchObject({ schema: 'notifications', table: 'devices', columns: { token: 'token', user_id: 'user_id' } })
  })

  it('renames the schema, the table and each column given', () => {
    const names = notificationsNames({ schema: 'push', devices: { table: 'push_targets', columns: { user_id: 'owner_id', token: 'address' } } })
    expect(names).toMatchObject({ schema: 'push', table: 'push_targets', columns: { user_id: 'owner_id', token: 'address', kind: 'kind' } })
  })

  it.each([
    ['schema', { schema: 'my"schema' }],
    ['schema', { schema: 'a;drop' }],
    ['devices.table', { devices: { table: 'public.devices' } }],
    ['devices.table', { devices: { table: 'my devices' } }],
    ['devices.columns.token', { devices: { columns: { token: 'tok\u0000en' } } }],
    ['devices.columns.token', { devices: { columns: { token: 'x'.repeat(64) } } }],
  ])('refuses a bad %s, naming the option', (option, options) => {
    expect(() => notificationsNames(options)).toThrow(`notifications ${option} is not a valid name`)
  })

  it('refuses a column the table does not have', () => {
    expect(() => notificationsNames({ devices: { columns: { owner: 'x' } as never } })).toThrow('devices.columns names "owner"')
  })
})

describe('historyNames', () => {
  it('names the table history in the notifications schema by default, and renames each part given', () => {
    expect(historyNames()).toMatchObject({ schema: 'notifications', table: 'history', columns: { read_at: 'read_at', user_id: 'user_id' } })
    expect(historyNames({ schema: 'push', history: { table: 'inbox', columns: { user_id: 'owner_id', read_at: 'seen_at' } } })).toMatchObject({
      schema: 'push',
      table: 'inbox',
      columns: { user_id: 'owner_id', read_at: 'seen_at', title: 'title' },
    })
  })

  it.each([
    ['history.table', { history: { table: 'my"inbox' } }],
    ['history.table', { history: { table: 'a;drop' } }],
    ['history.table', { history: { table: 'public.history' } }],
    ['history.columns.read_at', { history: { columns: { read_at: 'read at' } } }],
    ['history.columns.title', { history: { columns: { title: 'x'.repeat(64) } } }],
  ])('refuses a bad %s, in notifications() too', (option, options) => {
    expect(() => historyNames(options)).toThrow(`notifications ${option} is not a valid name`)
    expect(() => notifications(options)).toThrow(`notifications ${option} is not a valid name`)
  })

  it('refuses a column the table does not have', () => {
    expect(() => historyNames({ history: { columns: { read: 'x' } as never } })).toThrow('history.columns names "read"')
  })
})

describe('notifications()', () => {
  it('turns notifications on with its options', () => {
    expect(notifications({ ui: false })).toEqual({ name: 'protobase-notifications', notifications: { ui: false } })
  })

  it('takes a store with every method, and names a missing one', () => {
    expect(() => checkNotificationsOptions({ store: memoryDeviceStore() })).not.toThrow()
    const { removeGone: _, ...partial } = memoryDeviceStore()
    expect(() => notifications({ store: partial as unknown as DeviceStore })).toThrow('the device store has no removeGone method')
  })

  it.each(['record', 'list', 'countUnread', 'markRead', 'markAllRead', 'removeAllForUser'] as const)('names a history store without %s', (method) => {
    expect(() => checkNotificationsOptions({ historyStore: memoryHistoryStore() })).not.toThrow()
    const { [method]: _, ...partial } = memoryHistoryStore()
    expect(() => notifications({ historyStore: partial as unknown as HistoryStore })).toThrow(`the history store has no ${method} method`)
  })
})
