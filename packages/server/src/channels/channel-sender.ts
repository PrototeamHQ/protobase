import { Buffer } from 'node:buffer'
import { HttpProblem, notFound } from '../problem'
import { fitsFrame } from '../realtime/broadcast-frame'
import type { BroadcastHub } from '../realtime/broadcast-hub'
import { realtimeLimits } from '../realtime/realtime-limits'
import type { Registry } from '../registry'
import { bytesOf } from './binary-frame'
import { channelRecord, type ChannelRecord } from './channel-name'
import { channelRefusals } from './channel-refusals'
import { packSent, type Sent } from './sent'

/** A broadcast to the channel of a record, from outside a connection: a JSON payload, or bytes in an `ArrayBuffer` or typed array. */
export type ChannelBroadcast = { resource: string; key: string; event: string; payload: unknown }

/** What the app's own code broadcasts to record channels with, such as a function's `channels`. */
export type ChannelSender = {
  /**
   * Sends to every connection on the record's channel, of every process, as from the server (`server: true`, no
   * user); nothing is stored, so with nobody on it, it reaches nobody. Rejects with a 404 problem for a record name
   * the app does not have, 422 for an event over 255 bytes or a payload over a frame, 429 over the channel's rate.
   */
  broadcast: (message: ChannelBroadcast) => Promise<void>
}

const invalid = (refusal: { code: string; message: string }) => new HttpProblem(422, refusal.code, 'Unprocessable Content', refusal.message)

const invalidPayload = { code: 'invalid-payload', message: `A payload is JSON or bytes of at most ${realtimeLimits.maxFrameBytes} bytes` }

// A payload's size, its bytes or those of its JSON; NaN, refused as too big, for one that is neither.
const payloadBytes = (payload: unknown) => {
  if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) return payload.byteLength
  const json = JSON.stringify(payload)
  return json === undefined ? NaN : Buffer.byteLength(json)
}

/** The record a broadcast names, its event and payload checked, or a problem. */
export const broadcastRecord = (registry: Pick<Registry, 'find'>, { resource, key, event, payload }: ChannelBroadcast): ChannelRecord => {
  const found = channelRecord(registry, resource, key)
  if (found === 'too-long') throw invalid(channelRefusals.nameTooLong)
  if (!found) throw notFound(channelRefusals.notFound.message)
  if (!fitsFrame(event)) throw invalid(channelRefusals.eventTooLong)
  if (!(payloadBytes(payload) <= realtimeLimits.maxFrameBytes)) throw invalid(invalidPayload)
  return found
}

/**
 * Publishes a checked broadcast, refused with 429 when the channel took its broadcasts for this second. A typed array's
 * bytes go as an `ArrayBuffer` of their own.
 */
export const publishTo = async (broadcasts: BroadcastHub, record: ChannelRecord, event: string, sent: Sent) => {
  const payload = packSent({ ...sent, payload: bytesOf(sent.payload) ?? sent.payload })
  if (await broadcasts.publish([{ topic: record.name, event, payload, private: false }])) return
  throw new HttpProblem(429, channelRefusals.channelTooBusy.code, 'Too Many Requests', channelRefusals.channelTooBusy.message)
}

/** The server's own sender over the record channels' hub. */
export const channelSender = (registry: Pick<Registry, 'find'>, broadcasts: BroadcastHub): ChannelSender => ({
  broadcast: async (message) => publishTo(broadcasts, broadcastRecord(registry, message), message.event, { user: null, server: true, payload: message.payload }),
})
