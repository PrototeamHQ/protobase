import { Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { clientAddress, createRateLimit } from '../forms/rate-limit'
import { pushMessage, PushMessageError } from '../notifications/message'
import { relaySendRequest, type RelaySendAnswer } from '../notifications/relay/relay-protocol'
import { badRequest, HttpProblem } from '../problem'
import { authenticatedCredential } from './authenticate'
import { deliver } from './deliver'
import { maxRelaySendBytes, relayRegistrationsPerMinute, relaySendsPerHour, secondsToNextHour } from './limits'
import { relayRegisterPath, relaySendPath } from './paths'
import { maxRegistrationBytes, relayRegistration } from './registration'
import type { RelaySenders } from './senders'
import type { RelayStore } from './store'

export type PushRelayRoutesInput = { store: RelayStore; senders: RelaySenders; appId: string; now?: () => number }

const jsonOnly: MiddlewareHandler = async (c, next) => {
  const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') throw new HttpProblem(415, 'json-only', 'Unsupported Media Type', 'Send application/json')
  await next()
}

const limited = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: () => {
      throw new HttpProblem(413, 'too-large', 'Payload Too Large', `The body is larger than ${maxSize} bytes`)
    },
  })

const tooMany = (seconds: number, detail: string) => new HttpProblem(429, 'too-many-requests', 'Too Many Requests', detail, {}, { 'Retry-After': String(seconds) })

// A message senders refuse is a 400 naming the field at fault.
const messageProblem = (error: unknown): never => {
  if (error instanceof PushMessageError) throw badRequest('invalid-message', error.message)
  throw error
}

const checkedMessage = (given: Parameters<typeof pushMessage>[0]) => {
  try {
    return pushMessage(given)
  } catch (error) {
    return messageProblem(error)
  }
}

/**
 * The relay's endpoints, with no sign-in. `POST /register` takes a phone's APNs or FCM token and a workspace origin and
 * answers `{ handle }`, the same handle for the same token and origin, limited per client address. `POST /send` takes
 * a send of the relay protocol with a workspace credential as its bearer, counted against the credential's hour, and
 * delivers to the handles bound to the credential's origin, with that origin stamped in: it answers each handle, and
 * removes a handle whose token APNs or FCM reports gone.
 */
export const pushRelayRoutes = ({ store, senders, appId, now = Date.now }: PushRelayRoutesInput) => {
  const app = new Hono()
  const registrations = createRateLimit({ now })

  app.post(`/${relayRegisterPath}`, async (c, next) => {
    const wait = registrations.take(clientAddress(c.req.raw.headers), relayRegistrationsPerMinute)
    if (wait > 0) throw tooMany(wait, 'Too many registrations from this address; wait a minute')
    await next()
  }, jsonOnly, limited(maxRegistrationBytes), async (c) => {
    const handle = await store.register(relayRegistration(await c.req.json()))
    return c.json({ handle })
  })

  app.post(`/${relaySendPath}`, jsonOnly, limited(maxRelaySendBytes), async (c) => {
    const credential = await authenticatedCredential(store, c.req.header('authorization'))
    const parsed = relaySendRequest.safeParse(await c.req.json())
    if (!parsed.success) throw badRequest('invalid-send', `The send is invalid: ${parsed.error.issues[0]!.path.join('.') || 'body'}`)
    const message = checkedMessage(parsed.data.message)
    const { devices } = parsed.data
    if (!(await store.charge(credential.id, devices.length, relaySendsPerHour))) throw tooMany(secondsToNextHour(now()), `This credential sends to at most ${relaySendsPerHour} devices an hour`)
    const bindings = await store.bindings([...new Set(devices.map((device) => device.handle))])
    const results = await deliver(senders, appId, { message, origin: credential.origin, devices, bindings }).catch(messageProblem)
    await store.removeHandles([...results].filter(([, result]) => result === 'gone').map(([handle]) => handle))
    return c.json({ results: [...results].map(([handle, result]) => ({ handle, result })) } satisfies RelaySendAnswer)
  })

  return app
}
