import { z } from 'zod'
import { badRequest } from '../problem'
import { apnsEnvironments, type NewDevice } from './device'
import { canonicalEndpoint, isPushEndpoint } from './push-hosts'

// Every text: a length cap, and no control characters, which a URL parser would also drop silently.
const text = (max: number) => z.string().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]*$/)

// Base64url without padding, decoding to exactly `bytes` bytes.
const base64url = (bytes: number) =>
  z.string().max(200).regex(/^[A-Za-z0-9_-]+$/).refine((value) => Buffer.from(value, 'base64url').length === bytes)

const appId = z.string().regex(/^[A-Za-z0-9._-]{1,155}$/)
const userAgent = text(512).optional()
// The user the client registers for, the one whose click started it; refused when it is not the caller.
const userId = text(255).optional()

const web = z.strictObject({
  kind: z.literal('web'),
  endpoint: text(2048).refine(isPushEndpoint),
  keys: z.strictObject({ p256dh: base64url(65), auth: base64url(16) }),
  userAgent,
  userId,
})

const apns = z.strictObject({
  kind: z.literal('apns'),
  token: z.string().regex(/^[0-9a-f]{64,200}$/),
  environment: z.enum(apnsEnvironments),
  appId,
  userAgent,
  userId,
})

const fcm = z.strictObject({
  kind: z.literal('fcm'),
  token: z.string().regex(/^[A-Za-z0-9_:-]{1,4096}$/),
  appId: appId.optional(),
  userAgent,
  userId,
})

const registration = z.discriminatedUnion('kind', [web, apns, fcm])

/** The largest register body, in bytes. */
export const maxDeviceBodyBytes = 8 * 1024

/** A device as a register request gives it: everything but the session, which comes from the caller's token. */
export type DeviceInput = Omit<NewDevice, 'sessionId'>

/**
 * The device a register request's JSON body describes, and the user it names when it names one, or a 400 that names
 * the first field at fault and never its value: one kind's fields only, each within its format and length, and
 * nothing else.
 */
export const deviceInput = (body: unknown): { device: DeviceInput; userId?: string } => {
  const parsed = registration.safeParse(body)
  if (!parsed.success) {
    const field = parsed.error.issues[0]!.path.join('.') || 'body'
    throw badRequest('invalid-device', `The device is invalid: ${field}`)
  }
  const { userId } = parsed.data
  return { device: deviceOf(parsed.data), ...(userId !== undefined && { userId }) }
}

const deviceOf = (device: z.infer<typeof registration>): DeviceInput => {
  const base = { userAgent: device.userAgent ?? null }
  if (device.kind === 'web') return { ...base, kind: 'web', token: canonicalEndpoint(device.endpoint), p256dh: device.keys.p256dh, auth: device.keys.auth, environment: null, appId: null }
  if (device.kind === 'apns') return { ...base, kind: 'apns', token: device.token, p256dh: null, auth: null, environment: device.environment, appId: device.appId }
  return { ...base, kind: 'fcm', token: device.token, p256dh: null, auth: null, environment: null, appId: device.appId ?? null }
}
