import { realtimeLimits } from '../realtime/realtime-limits'
import type { ChannelError } from './channel-protocol'

const refusal = (code: string, message: string): ChannelError => ({ code, message })

/**
 * Every refusal of `/api/channels`. A record the caller may not read is refused as one that does not exist, so a
 * channel never tells which records there are.
 */
export const channelRefusals = {
  notFound: refusal('not-found', 'There is no such record'),
  invalidMessage: refusal('invalid-message', 'Send a JSON text frame of a ping, token, join, leave, track, untrack or send'),
  notJoined: refusal('not-joined', 'Join the channel first'),
  alreadyJoined: refusal('already-joined', 'This connection has joined the channel already'),
  nameTooLong: refusal('name-too-long', 'A channel name, its resource, a slash and its key, is at most 255 bytes'),
  eventTooLong: refusal('event-too-long', 'An event name is at most 255 bytes'),
  tooManyJoins: refusal('too-many-joins', `Too many joins: at most ${realtimeLimits.joinsPerSecond} a second`),
  tooManyChannels: refusal('too-many-channels', `Too many channels: at most ${realtimeLimits.channelsPerSocket} at once on a connection`),
  tooManyMessages: refusal('too-many-messages', `Too many messages: at most ${realtimeLimits.eventsPerSecond} broadcasts and presence updates a second`),
  channelTooBusy: refusal('channel-too-busy', `Too many broadcasts on this channel: at most ${realtimeLimits.topicBroadcastsPerSecond} a second, every sender's together`),
  tooManyPresenceUpdates: refusal('too-many-presence-updates', `Too many presence updates: at most ${realtimeLimits.presencePerWindow} every ${realtimeLimits.presenceWindowMs / 1000} seconds on a channel`),
  presenceTooLarge: refusal('presence-too-large', `A tracked state is at most ${realtimeLimits.maxPresenceBytes} bytes of JSON`),
}
