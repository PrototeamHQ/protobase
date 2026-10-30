import type { CallClientMessage, CallLeftReason, CallServerMessage, CallTrackRequest, CallTrackSource } from '@protobase/schema/internal'
import type { FunctionSocket, SocketEvents } from '../functions/function-socket'
import type { CallDoor, InCall } from './call-hub'
import type { CallRights } from './call-member'
import type { CallRingInput } from './call-ring'
import type { CallRecord } from './call-store'
import { memberEnd } from './close-codes'
import { parseClientMessage } from './client-message'
import type { MediaBackend, MemberEnd, MemberSession } from './media-backend'

/** The close code of a socket whose caller Protobase refused: the member leaves the call too. */
const refusedCloseCode = 1008

const mayPublish = (rights: CallRights, tracks: CallTrackRequest[]) =>
  rights.publish === true || (Array.isArray(rights.publish) && tracks.every((track) => (rights.publish as string[]).includes(track.source)))

// What a guest of a link the member makes may send: what they asked for, of what the member may send themselves.
const guestSources = (rights: CallRights, asked: CallTrackSource[]) => [...new Set(asked)].filter((source) => rights.publish === true || (Array.isArray(rights.publish) && rights.publish.includes(source)))

type GuestMessage = Extract<CallClientMessage, { type: 'guest-link' | 'guest-link-revoke' | 'guest-decide' | 'guest-remove' }>
const isGuestMessage = (message: CallClientMessage): message is GuestMessage => message.type.startsWith('guest-')

const refusals: Record<string, string> = { removed: 'You were removed from this call', full: 'This call is full', ended: 'This call has ended' }

export type MemberRelayInput = {
  door: CallDoor
  backend: MediaBackend
  record: CallRecord
  member: string
  rights: CallRights
  maxMembers: number
  maxMinutes: number
  report: (error: unknown) => void
  /** The signed-in user the member is: a ring of theirs stops once they join. */
  user?: string
  /** Whom the call rings when this member's join starts it. */
  ring?: CallRingInput
  /** Whether the member may make guest links to the call and let its guests in. */
  invites?: boolean
  /** The name the member shows the others in the call. */
  name?: string
  /** A guest, who comes only into their link's call. */
  guest?: { id: string; call: string }
}

/**
 * One member's socket, relayed to the call's media plugin: the relay reads and checks the browser's messages, lets
 * the member into the record's call at their `join` or `resume`, or tells them why not, refuses a publish the member
 * may not make, and tells the call and the plugin how the socket ended. The plugin only ever sees well-formed messages
 * of a member Protobase let in.
 */
export const memberRelay = ({ door, backend, record, member, rights, maxMembers, maxMinutes, report, user, ring, invites = false, name, guest }: MemberRelayInput): SocketEvents => {
  let browser: FunctionSocket
  let session: MemberSession | undefined
  let inCall: InCall | undefined
  let finished = false
  // LiveKit lost the member and the browser joins again at once: their time in the call goes on.
  let rejoining = false

  const send = (message: CallServerMessage) => {
    if (message.type === 'left' && message.reason === 'rejoin') rejoining = true
    void browser.send(JSON.stringify(message))
  }
  const end = (how: MemberEnd) => {
    session?.end(how)
    if (!inCall) return
    if (how === 'left') return void inCall.leave().catch(report)
    inCall.detach()
  }
  const close = (code: number, reason: string) => {
    if (finished) return
    finished = true
    end(rejoining ? 'lost' : memberEnd(code))
    browser.close(code, reason)
  }

  const enter = async (message: Extract<CallClientMessage, { type: 'join' | 'resume' }>) => {
    if (session) return close(refusedCloseCode, 'The call session already started')
    const resume = message.type === 'resume' ? { call: message.call, tracks: message.tracks.map((track) => ({ sid: track.sid, member, kind: track.kind, source: track.source, muted: false })) } : undefined
    const more = { ...(user !== undefined && { user }), ...(ring && !resume && { ring }), ...(invites && { invites }), ...(name !== undefined && { name }), ...(guest && { guest }) }
    const admitted = await door.admit({ record, member, maxMembers, maxMinutes, ...(resume && { resume }), ...more }, { send, close })
    if ('refused' in admitted) {
      send({ type: 'left', reason: admitted.refused satisfies CallLeftReason })
      return close(refusedCloseCode, refusals[admitted.refused]!)
    }
    inCall = admitted
    session = backend.open({ ...rights, call: admitted.call, member }, { send, close }, admitted.room)
    await session.receive(message)
    await admitted.listen(session.roster ?? (() => {}))
  }

  // A member who invites, in the call: a guest link, or a decision on its guests; refused for anyone else, a guest too.
  // Each request is answered once, so the browser pairs the answers with its requests in order.
  const guests = async (message: GuestMessage, call: string) => {
    const actions = door.guests
    if (!invites || !actions) return send({ type: 'guest-refused', reason: 'not-allowed' })
    switch (message.type) {
      case 'guest-link': {
        const made = await actions.link({ call, member, publish: guestSources(rights, message.publish), ...(message.expires_at && { expiresAt: new Date(message.expires_at) }) })
        if ('refused' in made) return send({ type: 'guest-refused', reason: made.refused })
        return send({ type: 'guest-link', link: made.link, token: made.token })
      }
      case 'guest-link-revoke':
        return send((await actions.revoke({ call, link: message.link, member })) ? { type: 'guest-done' } : { type: 'guest-refused', reason: 'gone' })
      case 'guest-decide': {
        const decided = await actions.decide({ call, guest: message.guest, member, admit: message.admit })
        return send(decided.refused ? { type: 'guest-refused', reason: decided.refused } : { type: 'guest-done' })
      }
      case 'guest-remove':
        await actions.remove(call, message.guest)
        return send({ type: 'guest-done' })
    }
  }

  const relay = async (message: CallClientMessage) => {
    if (message.type === 'join' || message.type === 'resume') return enter(message)
    if (!session || !inCall) return close(refusedCloseCode, 'Join or resume the call first')
    if (isGuestMessage(message)) return guests(message, inCall.call)
    if (message.type === 'publish' && !mayPublish(rights, message.tracks)) return send({ type: 'publish-refused', reason: 'The member may not publish these tracks' })
    await session.receive(message)
  }

  return {
    onOpen: (socket) => {
      browser = socket
    },
    onMessage: async (data) => {
      if (finished) return
      const message = parseClientMessage(data)
      if (!message) return close(refusedCloseCode, 'Not a call message')
      await relay(message)
    },
    onClose: (code) => {
      if (finished) return
      finished = true
      // Lost: the browser may resume, on any process, within the grace. Otherwise the member is out of the call.
      end(rejoining ? 'lost' : memberEnd(code))
    },
  }
}
