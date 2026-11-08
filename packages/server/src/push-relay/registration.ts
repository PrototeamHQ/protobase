import { z } from 'zod'
import { apnsEnvironments } from '../notifications/device'
import { badRequest } from '../problem'
import { workspaceOrigin } from './origin'
import type { RelayRegistration } from './store'

const origin = z.string().refine((text) => workspaceOrigin(text) !== undefined)

// The tokens as the APNs and FCM senders take them.
const apns = z.strictObject({ kind: z.literal('apns'), token: z.string().regex(/^[0-9a-f]{64,200}$/), environment: z.enum(apnsEnvironments), origin })
const fcm = z.strictObject({ kind: z.literal('fcm'), token: z.string().regex(/^[A-Za-z0-9_:-]{1,4096}$/), origin })

const registration = z.discriminatedUnion('kind', [apns, fcm])

/** The largest register body, in bytes. */
export const maxRegistrationBytes = 8 * 1024

/**
 * The registration a register request's JSON body gives, or a 400 naming the first field at fault, never its value:
 * an APNs token in lowercase hex with its environment, or an FCM token, and the https origin of the workspace.
 */
export const relayRegistration = (body: unknown): RelayRegistration => {
  const parsed = registration.safeParse(body)
  if (!parsed.success) throw badRequest('invalid-registration', `The registration is invalid: ${parsed.error.issues[0]!.path.join('.') || 'body'}`)
  const given = parsed.data
  if (given.kind === 'apns') return given
  return { ...given, environment: null }
}
