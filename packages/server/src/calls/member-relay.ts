import type { CallClientMessage, CallTrackRequest } from '@protobase/schema/internal'
import type { FunctionSocket, SocketEvents } from '../functions/function-socket'
import type { CallMember } from './call-member'
import { parseClientMessage } from './client-message'
import type { MediaBackend, MemberSession } from './media-backend'

/** The close code of a socket whose caller Protobase refused at a recheck: the member leaves the call too. */
const refusedCloseCode = 1008

const mayPublish = (member: CallMember, tracks: CallTrackRequest[]) =>
  member.publish === true || (Array.isArray(member.publish) && tracks.every((track) => (member.publish as string[]).includes(track.source)))

/**
 * One member's socket, relayed to the call's media plugin: the relay reads and checks the browser's messages, refuses a
 * publish the member may not make, opens the member's session at their `join` or `resume` and tells it how the socket
 * ended. The plugin only ever sees well-formed messages of a member Protobase admitted.
 */
export const memberRelay = (backend: MediaBackend, member: CallMember): SocketEvents => {
  let browser: FunctionSocket
  let session: MemberSession | undefined
  let finished = false

  const send = (message: object) => void browser.send(JSON.stringify(message))
  const close = (code: number, reason: string) => {
    if (finished) return
    finished = true
    session?.end(code === 1000 || code === refusedCloseCode ? 'left' : 'lost')
    browser.close(code, reason)
  }

  const relay = async (message: CallClientMessage) => {
    if (message.type === 'join' || message.type === 'resume') {
      if (session) return close(refusedCloseCode, 'The call session already started')
      session = backend.open(member, { send, close })
      return session.receive(message)
    }
    if (!session) return close(refusedCloseCode, 'Join or resume the call first')
    if (message.type === 'publish' && !mayPublish(member, message.tracks)) return send({ type: 'publish-refused', reason: 'The member may not publish these tracks' })
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
      // Refused by Protobase: the member is out of the call. Otherwise the browser may resume, on any process.
      session?.end(code === refusedCloseCode ? 'left' : 'lost')
    },
  }
}
