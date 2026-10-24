import { describe, expect, it } from 'vitest'
import type { DeviceStore } from './device-store'
import { checkNotificationsOptions, notificationsNames } from './options'
import { notifications } from './plugin'
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

describe('notifications()', () => {
  it('turns notifications on with its options', () => {
    expect(notifications({ ui: false })).toEqual({ name: 'protobase-notifications', notifications: { ui: false } })
  })

  it('takes a store with every method, and names a missing one', () => {
    expect(() => checkNotificationsOptions({ store: memoryDeviceStore() })).not.toThrow()
    const { removeGone: _, ...partial } = memoryDeviceStore()
    expect(() => notifications({ store: partial as unknown as DeviceStore })).toThrow('the device store has no removeGone method')
  })
})
