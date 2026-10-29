import type { CallClientMessage, CallLeftReason, CallServerMessage, CallTrackRequest } from '@protobase/schema/internal'
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
}

/**
 * One member's socket, relayed to the call's media plugin: the relay reads and checks the browser's messages, lets
 * the member into the record's call at their `join` or `resume`, or tells them why not, refuses a publish the member
 * may not make, and tells the call and the plugin how the socket ended. The plugin only ever sees well-formed messages
 * of a member Protobase let in.
 */
export const memberRelay = ({ door, backend, record, member, rights, maxMembers, maxMinutes, report, user, ring }: MemberRelayInput): SocketEvents => {
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
    const admitted = await door.admit({ record, member, maxMembers, maxMinutes, ...(resume && { resume }), ...(user !== undefined && { user }), ...(ring && !resume && { ring }) }, { send, close })
    if ('refused' in admitted) {
      send({ type: 'left', reason: admitted.refused satisfies CallLeftReason })
      return close(refusedCloseCode, refusals[admitted.refused]!)
    }
    inCall = admitted
    session = backend.open({ ...rights, call: admitted.call, member }, { send, close }, admitted.room)
    await session.receive(message)
    await admitted.listen(session.roster ?? (() => {}))
  }

  const relay = async (message: CallClientMessage) => {
    if (message.type === 'join' || message.type === 'resume') return enter(message)
    if (!session) return close(refusedCloseCode, 'Join or resume the call first')
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
