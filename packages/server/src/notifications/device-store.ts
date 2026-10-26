import type { Device, NewDevice } from './device'

/**
 * Where each user's devices are kept: the Postgres default (`postgresDeviceStore`), or a store of the app's own passed
 * as `notifications.store`. Plain data in and out, so any store can implement it. Every method throws on an empty
 * user id, id or token, and none touches every device.
 */
export type DeviceStore = {
  /**
   * Registers the device for `userId`, or refreshes it when the user has it already, its session included. An APNs or
   * FCM token another user holds moves to `userId` as a new device: a new id, its fields as given, created and last
   * seen now. A browser's endpoint another user holds stays theirs, unchanged, and the answer is `undefined`: a browser
   * can always subscribe afresh, so an endpoint never changes hands.
   */
  register: (userId: string, device: NewDevice) => Promise<Device | undefined>
  /** Removes the device with this id when it is `userId`'s; another user's is left as it is. */
  remove: (userId: string, id: string) => Promise<void>
  /** The user's devices. */
  listForUser: (userId: string) => Promise<Device[]>
  /** The devices with these ids, whoever holds them: for senders, never for ids a client sends. */
  listByIds: (ids: readonly string[]) => Promise<Device[]>
  /** Removes the devices whose tokens a push service reports gone, whoever holds them: for senders only. */
  removeGone: (tokens: readonly string[]) => Promise<void>
  /** Removes every device of the user, as when the user is deleted. */
  removeAllForUser: (userId: string) => Promise<void>
}

const methods = ['register', 'remove', 'listForUser', 'listByIds', 'removeGone', 'removeAllForUser'] as const satisfies readonly (keyof DeviceStore)[]

/** The store, checked to have every method; a missing one is an error naming it. */
export const checkDeviceStore = (store: DeviceStore) => {
  const missing = methods.find((method) => typeof (store as Partial<DeviceStore>)[method] !== 'function')
  if (missing !== undefined) throw new Error(`notifications.store: the device store has no ${missing} method`)
  return store
}

/** The value, refused when empty: no store call may be read as "every device". */
export const required = (name: string, value: string) => {
  if (typeof value !== 'string' || value === '') throw new Error(`The device store needs a ${name}`)
  return value
}
