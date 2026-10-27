import { HttpProblem } from '../problem'
import { fitsFrame } from './broadcast-frame'
import type { Publication } from './broadcast-hub'
import { realtimeLimits } from './realtime-limits'

/** A refused broadcast request; `message` too, which realtime-js's `httpSend` reads as the error. */
export const broadcastProblem = (status: number, slug: string, title: string, detail: string) => new HttpProblem(status, slug, title, detail, { message: detail })

const invalid = (detail: string) => broadcastProblem(422, 'invalid-broadcast', 'Unprocessable Content', detail)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A message as the channels hear it, on the topic they joined: realtime-js names the topic without the `realtime:` its
 * channels join with. A topic and an event are at most 255 bytes, as on the socket.
 */
export const publicationOf = (topic: string, event: string, payload: unknown, isPrivate: boolean): Publication => {
  const channelTopic = `realtime:${topic}`
  if (!fitsFrame(channelTopic) || !fitsFrame(event)) throw invalid('A broadcast topic and event are at most 255 bytes each')
  return { topic: channelTopic, event, payload, private: isPrivate }
}

/**
 * The body of `POST /api/broadcast`, Supabase's `{ messages: [{ topic, event, payload, private }] }`: each message has a
 * topic, an event and an object payload, and is private when `private` is `true`. A batch holds at most as many messages
 * as a socket sends in a second, refused with 429 as Supabase refuses a batch over its rate.
 */
export const batchOf = (body: unknown): Publication[] => {
  const messages = isRecord(body) ? body.messages : undefined
  if (!Array.isArray(messages) || messages.length === 0) throw invalid('Send the broadcasts as a list of messages')
  if (messages.length > realtimeLimits.eventsPerSecond) {
    throw broadcastProblem(429, 'too-many-broadcasts', 'Too Many Requests', `Too many messages to broadcast, send at most ${realtimeLimits.eventsPerSecond} at once`)
  }
  return messages.map((message: unknown) => {
    if (!isRecord(message)) throw invalid('Each message is an object')
    const { topic, event, payload } = message
    if (typeof topic !== 'string' || topic === '') throw invalid('Each message needs a topic')
    if (typeof event !== 'string' || event === '') throw invalid('Each message needs an event')
    if (!isRecord(payload)) throw invalid('Each message needs a payload object')
    if (message.private !== undefined && message.private !== null && typeof message.private !== 'boolean') throw invalid('A message\'s private is true or false')
    return publicationOf(topic, event, payload, message.private === true)
  })
}
