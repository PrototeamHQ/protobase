import type { ViewModel } from '@protobase/schema'
import { eventLimit, type RealtimeRelayOptions, type RelayClientEvent } from './relay-options'

/**
 * The framework's typing event, as a conversation page with `typing` sends it on its record's channel:
 * `{ typing, thread }`, `thread` the key of the thread's first message or null, so the size leaves room for a key.
 */
export const typingClientEvent: RelayClientEvent = {
  schema: {
    type: 'object',
    properties: { typing: { type: 'boolean' }, thread: { type: ['string', 'number', 'null'] } },
    required: ['typing'],
    additionalProperties: false,
  },
  maxBytes: 256,
  perSecond: 2,
  burst: 4,
}

/** The resources whose conversation page has `typing`, so their channels carry the typing event. */
export const typingResources = (views: readonly ViewModel[]) =>
  new Set(views.flatMap((view) => (view.record && 'conversation' in view.record && view.record.conversation.typing ? [view.resource] : [])))

const relayEvent = (event: RelayClientEvent) => ({ schema: event.schema, max_bytes: eventLimit(event.maxBytes), per_second: eventLimit(event.perSecond), burst: eventLimit(event.burst) })

/**
 * The relay's `client_events` of the app: each channel resource's declared events, with `typing` on those whose
 * conversation page types unless the resource declares a `typing` of its own, in the relay's field names. Undefined
 * when no channel has an event, so clients send nothing.
 */
export const relayClientEvents = (channels: RealtimeRelayOptions['channels'], typing: ReadonlySet<string>) => {
  const declared = Object.entries(channels).flatMap(([resource, channel]) => {
    const events = { ...(typing.has(resource) && { typing: typingClientEvent }), ...channel.events }
    if (Object.keys(events).length === 0) return []
    return [[resource, { events: Object.fromEntries(Object.entries(events).map(([name, event]) => [name, relayEvent(event)])) }] as const]
  })
  if (declared.length === 0) return
  return { channels: Object.fromEntries(declared) }
}
