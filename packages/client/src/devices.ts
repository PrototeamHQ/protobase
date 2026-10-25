import { devicesPath } from '@protobase/schema/internal'
import type { Transport } from './transport'

/**
 * A browser's push subscription as it registers it: its endpoint and keys, what it is, and the user whose click
 * started the registration, which the server refuses with a 409 when someone else is signed in by then.
 */
export type WebDeviceRegistration = { kind: 'web'; endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string; userId?: string }

/** A device as the server answers it: never its token or keys. */
export type RegisteredDevice = { id: string; kind: 'web' | 'apns' | 'fcm'; createdAt: string; lastSeenAt: string }

/**
 * The signed-in user's own devices (`/api/notifications/devices`): `register` adds or refreshes the device the request
 * comes from, and rejects with an `ApiError` of slug `device-held` when another user holds the browser's endpoint, or
 * `other-user` when the user it names is not the one signed in; `remove` removes one by its id.
 */
export const devicesClient = (send: Transport) => ({
  register: async (device: WebDeviceRegistration): Promise<RegisteredDevice> => (await send({ method: 'POST', path: devicesPath(''), system: true, body: device })).json() as Promise<RegisteredDevice>,
  remove: async (id: string) => {
    await send({ method: 'DELETE', path: devicesPath('', id), system: true })
  },
})

export type DevicesClient = ReturnType<typeof devicesClient>
