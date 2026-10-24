import type { Device } from '../device'
import { required, type DeviceStore } from '../device-store'

/**
 * A device store in memory, for tests only: it shows the interface needs no database. `devices` is its content, for a
 * test to read.
 */
export const memoryDeviceStore = () => {
  const devices = new Map<string, Device>()
  const byToken = (token: string) => [...devices.values()].find((device) => device.token === token)
  const store: DeviceStore = {
    register: async (userId, device) => {
      required('user id', userId)
      required('token', device.token)
      const now = new Date()
      const held = byToken(device.token)
      if (held) devices.delete(held.id)
      const own = held?.userId === userId ? held : undefined
      const stored: Device = { ...device, id: own?.id ?? crypto.randomUUID(), userId, createdAt: own?.createdAt ?? now, lastSeenAt: now }
      devices.set(stored.id, stored)
      return { ...stored }
    },
    remove: async (userId, id) => {
      required('user id', userId)
      required('device id', id)
      if (devices.get(id)?.userId === userId) devices.delete(id)
    },
    listForUser: async (userId) => {
      required('user id', userId)
      return [...devices.values()].filter((device) => device.userId === userId).map((device) => ({ ...device }))
    },
    listByIds: async (ids) => ids.map((id) => required('device id', id)).flatMap((id) => (devices.has(id) ? [{ ...devices.get(id)! }] : [])),
    removeGone: async (tokens) => {
      for (const token of tokens.map((given) => required('token', given))) {
        const held = byToken(token)
        if (held) devices.delete(held.id)
      }
    },
    removeAllForUser: async (userId) => {
      required('user id', userId)
      for (const device of [...devices.values()]) if (device.userId === userId) devices.delete(device.id)
    },
  }
  return Object.assign(store, { devices })
}
