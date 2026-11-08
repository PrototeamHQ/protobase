import { z } from 'zod'
import type { PushMessage } from '../message'
import { maxStoreIdLength } from '../send-input'

/** The path of the relay's send endpoint, under the relay's URL. */
export const relaySendPath = 'send'

/** The most devices one send request names. */
export const maxRelayDevices = 100

/** A relay handle: what the relay gave a device for one workspace, opaque to the workspace and never a raw push token. */
export const relayHandle = /^[A-Za-z0-9_-]{16,512}$/

/** One device of a send: its handle, and the id of the user it is registered for, which its payload carries as `user`. */
export type RelayDevice = { handle: string; user: string }

/**
 * The body of `POST <relay>/send`, sent with the workspace's relay credential as a bearer token: a message as
 * `pushMessage` checks it, with its `url` opened on tap, and up to `maxRelayDevices` devices.
 */
export type RelaySendRequest = { message: PushMessage; devices: RelayDevice[] }

/** What the relay did with one handle, as a sender answers a device (see `PushAnswer`). */
export const relayResults = ['ok', 'gone', 'retry', 'refused'] as const
export type RelayResult = (typeof relayResults)[number]

/** The relay's 2xx answer to a send: one result for each handle it took. */
export type RelaySendAnswer = { results: { handle: string; result: RelayResult }[] }

/** One device's shape in a send request: a relay handle, and a user id as long as a store takes one. */
export const relaySendDevice = z.strictObject({ handle: z.string().regex(relayHandle), user: z.string().min(1).max(maxStoreIdLength) })

/**
 * The send request's shape. The message is only an object here: the relay checks it with `pushMessage`, as every
 * sender does.
 */
export const relaySendRequest = z.strictObject({
  message: z.custom<PushMessage>((value) => typeof value === 'object' && value !== null && !Array.isArray(value)),
  devices: z.array(relaySendDevice).min(1).max(maxRelayDevices),
})

/** The send answer's shape. Fields the relay adds later are allowed and ignored. */
export const relaySendAnswer = z.object({
  results: z.array(z.object({ handle: z.string(), result: z.enum(relayResults) })).max(maxRelayDevices),
})
