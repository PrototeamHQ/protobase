import { Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HttpProblem } from '../problem'
import type { AdminEnv } from '../types'
import { ownSignInUser } from './caller'
import type { Device } from './device'
import { deviceInput, maxDeviceBodyBytes } from './device-input'
import type { DeviceStore } from './device-store'
import { deviceIdParam } from './paths'

/** The most devices one user keeps: registering one more drops their least recently seen. */
export const maxDevicesPerUser = 20

type DevicesEnv = AdminEnv & { Variables: { deviceUser: string } }

// Before anything of the request is read: only the user signed in as themselves.
const ownSignIn: MiddlewareHandler<DevicesEnv> = async (c, next) => {
  c.set('deviceUser', ownSignInUser(c.get('session')))
  await next()
}

const jsonOnly: MiddlewareHandler<DevicesEnv> = async (c, next) => {
  const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') throw new HttpProblem(415, 'json-only', 'Unsupported Media Type', 'Send the device as application/json')
  await next()
}

const limited = bodyLimit({
  maxSize: maxDeviceBodyBytes,
  onError: () => {
    throw new HttpProblem(413, 'too-large', 'Payload Too Large', `The device is larger than ${maxDeviceBodyBytes} bytes`)
  },
})

// What the caller learns of their device: never its token or keys.
const answer = (device: Device) => ({ id: device.id, kind: device.kind, createdAt: device.createdAt.toISOString(), lastSeenAt: device.lastSeenAt.toISOString() })

// The user's devices past the cap, least recently seen first, never the one just registered.
const dropOldest = async (store: DeviceStore, userId: string, kept: Device) => {
  const others = (await store.listForUser(userId)).filter((device) => device.id !== kept.id)
  const extra = others.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime()).slice(maxDevicesPerUser - 1)
  for (const device of extra) await store.remove(userId, device.id)
}

/**
 * The caller's own devices, mounted at `devicesPath` behind the API's authenticator: `POST` registers or refreshes the
 * device the request comes from, `DELETE` with its id removes it. Tokens travel in the body only, never the URL.
 */
export const deviceRoutes = (store: DeviceStore) => {
  const app = new Hono<DevicesEnv>()

  app.post('/', ownSignIn, jsonOnly, limited, async (c) => {
    const userId = c.get('deviceUser')
    const device = deviceInput(await c.req.json())
    const stored = await store.register(userId, device)
    // A store must answer with the caller's own record of this very token, never another user's.
    if (stored.userId !== userId || stored.token !== device.token) throw new Error('The device store answered register with another device')
    await dropOldest(store, userId, stored)
    return c.json(answer(stored))
  })

  // Answers alike whether the device was the caller's, someone else's or none at all.
  app.delete(`/:${deviceIdParam}`, ownSignIn, async (c) => {
    const userId = c.get('deviceUser')
    const id = c.req.param(deviceIdParam)
    const own = await store.listForUser(userId)
    if (own.some((device) => device.id === id)) await store.remove(userId, id)
    return c.body(null, 204)
  })

  return app
}
