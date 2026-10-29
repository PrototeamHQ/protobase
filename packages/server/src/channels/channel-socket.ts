import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import type { BroadcastHub, BroadcastMember } from '../realtime/broadcast-hub'
import { fitsFrame } from '../realtime/broadcast-frame'
import { fixedWindow, fixedWindows } from '../realtime/fixed-window'
import type { PresenceHub, PresenceSeat } from '../realtime/presence-hub'
import { realtimeLimits } from '../realtime/realtime-limits'
import type { Session } from '../types'
import { channelBounds } from './channel-bounds'
import type { ChannelRecord } from './channel-name'
import { encodeBinaryFrame } from './binary-frame'
import { decodeBinaryMessage, decodeClientMessage, type ChannelError, type ChannelUser, type ClientMessage, type ServerMessage } from './channel-protocol'
import { channelRefusals } from './channel-refusals'
import { entriesOf, entryDiff } from './presence-entries'
import { packSent, senderOf, unpackSent, type Sent } from './sent'

export type ChannelSocketOptions = {
  send: (frame: string | ArrayBuffer) => void
  /** The bytes the socket was sent and has not written out to the client yet. */
  buffered: () => number
  close: (code?: number) => void
  /** The session the connection opened with. */
  session: Session
  /**
   * The connection's session now, from the request it opened with and the last bearer token the client handed over,
   * if any; rejects once it signs in nobody.
   */
  reauthenticate: (token: string | undefined) => Promise<Session>
  /** The record a resource and key name (`channelRecord`). */
  record: (resource: string, key: string) => ChannelRecord | 'too-long' | undefined
  /** Whether the session may read the record (`recordReadable`). */
  readable: (session: Session, record: ChannelRecord) => Promise<boolean>
  broadcasts: BroadcastHub
  presences: PresenceHub
  report: (error: unknown) => void
  now?: () => number
}

type Channel = { record: ChannelRecord; member: BroadcastMember; seat: PresenceSeat; checkedAt: number; remove: () => void }

// A frame over the size cap, and a client that does not keep up with what it is sent or that sends too much at once.
const messageTooBig = 1009
const policyViolation = 1008

// NaN for a kind of frame whose size is unknown, which is refused as too big.
const frameBytes = (frame: unknown) => {
  if (typeof frame === 'string') return Buffer.byteLength(frame)
  if (frame instanceof ArrayBuffer || ArrayBuffer.isView(frame)) return frame.byteLength
  if (frame instanceof Blob) return frame.size
  return NaN
}

const userOf = (session: Session): ChannelUser => (session.anonymous ? null : session.user.id)

/**
 * One WebSocket of `/api/channels`: channels named by records, which a caller joins only while it may read the record,
 * with presence and broadcasts between the connections on each. Messages are handled one at a time, in order. Every
 * presence and broadcast carries the session's user, never one the client names. The session and each channel's read
 * access are checked again every `channelBounds.recheckMs`, and a send or track trusts the last check for
 * `channelBounds.readCacheMs`: a channel whose record the caller may no longer read is closed, and a session that signs
 * in nobody, or someone else, closes the socket. A socket silent for `channelBounds.idleMs` is closed, and a close
 * leaves every channel, its presences with it. The limits are `realtimeLimits`, as on `/api/sb/realtime/v1`.
 */
export const channelSocket = ({ send, buffered, close, session: first, reauthenticate, record, readable, broadcasts, presences, report, now = Date.now }: ChannelSocketOptions) => {
  const channels = new Map<string, Channel>()
  let session = first
  let token: string | undefined
  let queue = Promise.resolve()
  let queuedMessages = 0
  let queuedBytes = 0
  let idle: ReturnType<typeof setTimeout> | undefined
  let open = true
  const events = fixedWindow(realtimeLimits.eventsPerSecond, 1000, now)
  const joins = fixedWindow(realtimeLimits.joinsPerSecond, 1000, now)
  const presenceRate = fixedWindows(realtimeLimits.presencePerWindow, realtimeLimits.presenceWindowMs, now)

  const leaveAll = () => {
    open = false
    clearTimeout(idle)
    clearInterval(recheck)
    for (const name of [...channels.keys()]) leave(name)
  }

  // Every close the server makes. It sends nothing more at once, and leaves just after: it may come from inside a hub's
  // loop, as a member's delivery, and the members after it then hear that diff before its leave.
  const shut = (code?: number) => {
    if (!open) return
    open = false
    clearTimeout(idle)
    clearInterval(recheck)
    close(code)
    Promise.resolve().then(leaveAll).catch(report)
  }

  // A client that has not read what it was sent gets no more: `!(… <= …)` closes for an amount that is not a number too.
  // A broadcast of bytes goes as a binary frame.
  const push = (message: ServerMessage) => {
    if (!open) return
    if (!(buffered() <= realtimeLimits.maxUnsentBytes)) return shut(policyViolation)
    if (message.type === 'broadcast' && message.payload instanceof ArrayBuffer) {
      const { payload, ...header } = message
      return send(encodeBinaryFrame(header, payload))
    }
    send(JSON.stringify(message))
  }
  const ok = (ref: string | undefined, channel?: string) => {
    if (ref === undefined) return
    push({ type: 'reply', ref, ok: true, ...(channel !== undefined && { channel }) })
  }
  const refuse = (ref: string | undefined, error: ChannelError) => {
    if (ref === undefined) return push({ type: 'error', error })
    push({ type: 'reply', ref, ok: false, error })
  }

  const leave = (name: string) => {
    channels.get(name)?.remove()
    channels.delete(name)
  }

  // Leaves a channel whose record the caller may no longer read, and tells the client so.
  const end = (name: string, error: ChannelError) => {
    if (!channels.has(name)) return
    leave(name)
    push({ type: 'closed', channel: name, error })
  }

  const join = async (message: Extract<ClientMessage, { type: 'join' }>) => {
    if (!joins()) return refuse(message.ref, channelRefusals.tooManyJoins)
    const found = record(message.resource, message.key)
    if (found === 'too-long') return refuse(message.ref, channelRefusals.nameTooLong)
    if (found && channels.has(found.name)) return refuse(message.ref, channelRefusals.alreadyJoined)
    if (channels.size >= realtimeLimits.channelsPerSocket) return refuse(message.ref, channelRefusals.tooManyChannels)
    if (!found || !(await readable(session, found))) return refuse(message.ref, channelRefusals.notFound)
    // With several processes, once their presences are known, so that the channel's presence holds them.
    await presences.ready()
    if (!open || channels.has(found.name)) return
    const { name } = found
    const member: BroadcastMember = { self: false, private: false, receive: (event, payload) => hear(name, event, unpackSent(payload)) }
    const seat = presences.join(name, { key: randomUUID(), private: false, listens: true, receive: (diff) => push({ type: 'presence_diff', channel: name, ...entryDiff(diff) }) })
    const offBroadcast = broadcasts.join(name, member)
    channels.set(name, { record: found, member, seat, checkedAt: now(), remove: () => (offBroadcast(), seat.leave()) })
    ok(message.ref, name)
    push({ type: 'presence', channel: name, entries: entriesOf(seat.state()) })
  }

  const hear = (name: string, event: string, sent: Sent) => {
    if (!channels.has(name)) return
    push({ type: 'broadcast', channel: name, event, payload: sent.payload, ...senderOf(sent) })
  }

  // Whether the caller may still read the channel's record, by a check at most `readCacheMs` old: the channel is
  // closed when not.
  const stillReadable = async (name: string, channel: Channel) => {
    if (now() - channel.checkedAt < channelBounds.readCacheMs) return true
    const allowed = await readable(session, channel.record)
    if (channels.get(name) !== channel) return false
    if (!allowed) {
      end(name, channelRefusals.notFound)
      return false
    }
    channel.checkedAt = now()
    return true
  }

  const sendBroadcast = async (message: Extract<ClientMessage, { type: 'send' }>, channel: Channel) => {
    if (!events()) return refuse(message.ref, channelRefusals.tooManyMessages)
    if (!fitsFrame(message.event)) return refuse(message.ref, channelRefusals.eventTooLong)
    if (!(await stillReadable(message.channel, channel))) return refuse(message.ref, channelRefusals.notFound)
    const sent: Sent = { user: userOf(session), payload: message.payload }
    if (!(await broadcasts.send(message.channel, channel.member, message.event, packSent(sent)))) return refuse(message.ref, channelRefusals.channelTooBusy)
    if (message.self === true) hear(message.channel, message.event, sent)
    if (message.ack === true) ok(message.ref)
  }

  const updatePresence = async (message: Extract<ClientMessage, { type: 'track' | 'untrack' }>, channel: Channel) => {
    if (!events()) return refuse(message.ref, channelRefusals.tooManyMessages)
    if (!presenceRate(message.channel)) return refuse(message.ref, channelRefusals.tooManyPresenceUpdates)
    if (message.type === 'untrack') {
      channel.seat.untrack()
      return ok(message.ref)
    }
    if (Buffer.byteLength(JSON.stringify(message.state) ?? '') > realtimeLimits.maxPresenceBytes) return refuse(message.ref, channelRefusals.presenceTooLarge)
    if (!(await stillReadable(message.channel, channel))) return refuse(message.ref, channelRefusals.notFound)
    channel.seat.track({ user: userOf(session), state: message.state })
    ok(message.ref)
  }

  const handle = async (message: ClientMessage) => {
    if (!open) return
    if (message.type === 'ping') return push({ type: 'pong' })
    if (message.type === 'token') {
      token = message.token
      return
    }
    if (message.type === 'join') return join(message)
    const channel = channels.get(message.channel)
    if (!channel) return refuse(message.ref, channelRefusals.notJoined)
    if (message.type === 'send') return sendBroadcast(message, channel)
    if (message.type === 'track' || message.type === 'untrack') return updatePresence(message, channel)
    leave(message.channel)
    ok(message.ref)
  }

  // The session first: one that signs in nobody, or someone else, closes the socket; then each channel's record.
  const checkAgain = async () => {
    const again = await reauthenticate(token).then(
      (next) => next,
      () => undefined,
    )
    if (!open) return
    if (!again || userOf(again) !== userOf(session)) return shut(policyViolation)
    session = again
    for (const [name, channel] of [...channels]) {
      const allowed = await readable(session, channel.record)
      if (channels.get(name) !== channel) continue
      if (!allowed) end(name, channelRefusals.notFound)
      else channel.checkedAt = now()
    }
  }
  let rechecking = false
  const recheck = setInterval(() => {
    if (rechecking || !open) return
    rechecking = true
    checkAgain()
      .catch(fail)
      .finally(() => (rechecking = false))
  }, channelBounds.recheckMs)

  const stayAwake = () => {
    clearTimeout(idle)
    idle = setTimeout(() => shut(), channelBounds.idleMs)
  }
  stayAwake()

  const fail = (error: unknown) => {
    report(error)
    shut()
  }

  return {
    /**
     * Handles a frame after those before it: a text one, or a binary `ArrayBuffer` of a send of bytes; one that is not
     * a message gets an error. A frame over the size cap, or of a kind whose size is unknown, closes the socket.
     */
    message: (frame: unknown) => {
      if (!open) return
      const size = frameBytes(frame)
      if (!(size <= realtimeLimits.maxFrameBytes)) return shut(messageTooBig)
      stayAwake()
      const message = typeof frame === 'string' ? decodeClientMessage(frame) : frame instanceof ArrayBuffer ? decodeBinaryMessage(frame) : undefined
      if (!message) return push({ type: 'error', error: channelRefusals.invalidMessage })
      queuedMessages += 1
      queuedBytes += size
      if (queuedMessages > realtimeLimits.maxQueuedMessages || queuedBytes > realtimeLimits.maxQueuedBytes) return shut(policyViolation)
      queue = queue
        .then(() => handle(message))
        .catch(fail)
        .finally(() => {
          queuedMessages -= 1
          queuedBytes -= size
        })
    },
    /** Ends every channel of a socket that closed. */
    closed: leaveAll,
  }
}
