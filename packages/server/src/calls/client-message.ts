import { z } from 'zod'
import type { CallClientMessage } from '@protobase/schema/internal'

const id = z.string().min(1).max(256)
const sdp = z.string().min(1).max(256 * 1024)
const kind = z.enum(['audio', 'video'])
const size = z.number().int().min(0).max(16384)

const layer = z.strictObject({ quality: z.enum(['low', 'medium', 'high']), width: size, height: size, bitrate: z.number().int().min(0).max(100_000_000) })
const source = z.enum(['camera', 'microphone', 'screen', 'screen-audio'])
const track = z.strictObject({
  cid: id,
  kind,
  source,
  width: size.optional(),
  height: size.optional(),
  layers: z.array(layer).max(3).optional(),
})
const candidate = z.strictObject({
  candidate: z.string().max(4096),
  sdpMid: z.string().max(64).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(1024).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
})

const description = z.strictObject({ type: z.enum(['offer', 'answer']), sdp })

const message = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('join') }),
  z.strictObject({ type: z.literal('resume'), call: id, participant: id, offer: sdp.optional(), answer: sdp.optional(), tracks: z.array(z.strictObject({ cid: id, sid: id, kind, source })).max(16) }),
  z.strictObject({ type: z.literal('publish'), tracks: z.array(track).min(1).max(4) }),
  z.strictObject({ type: z.literal('offer'), sdp, id: z.number().int().min(0) }),
  z.strictObject({ type: z.literal('candidate'), candidate }),
  z.strictObject({ type: z.literal('unpublish'), sid: id }),
  z.strictObject({ type: z.literal('mute'), sid: id, muted: z.boolean() }),
  z.strictObject({ type: z.literal('signal'), to: id, description: description.optional(), candidate: candidate.optional() }),
  z.strictObject({ type: z.literal('view'), sids: z.array(id).min(1).max(256), width: size, height: size, hidden: z.boolean().optional() }),
  z.strictObject({ type: z.literal('leave') }),
])

/** A browser's message, or `undefined` when it is no message of the call protocol. */
export const parseClientMessage = (data: string | ArrayBuffer): CallClientMessage | undefined => {
  if (typeof data !== 'string') return undefined
  let json: unknown
  try {
    json = JSON.parse(data)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
  const parsed = message.safeParse(json)
  return parsed.success ? (parsed.data as CallClientMessage) : undefined
}
