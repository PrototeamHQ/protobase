import type { CallClientMessage, CallRemoteTrack } from '@protobase/schema/internal'
import type { CallMember } from '../call-member'
import type { PeerBackend } from '../calls-options'
import type { MediaBackend, MemberLink, MemberSession } from '../media-backend'

/** How long a member whose socket was lost stays in the call for the others, waiting for their browser to resume. */
const awayMs = 30_000

type Present = { member: CallMember; link: MemberLink; tracks: Map<string, CallRemoteTrack>; away?: ReturnType<typeof setTimeout> }

/**
 * The peer plugin: no media server. Protobase passes each member's descriptions and candidates to the member they name,
 * and tells every member who else is in the call and which of their tracks they hear; the browsers send their media to
 * each other directly. Members meet only within this process, which keeps who is in each call.
 */
export const peerBackend = (settings: PeerBackend): MediaBackend => {
  // Only the members of live calls: each leaves with their socket, or `awayMs` after it was lost.
  const calls = new Map<string, Map<string, Present>>()

  const membersOf = (call: string) => [...(calls.get(call)?.values() ?? [])]
  const announce = (call: string) => {
    const present = membersOf(call)
    for (const viewer of present) {
      if (viewer.away) continue
      const others = present.filter((other) => other !== viewer)
      const hears = viewer.member.hears ?? (() => true)
      viewer.link.send({ type: 'peers', members: others.map((other) => other.member.member) })
      viewer.link.send({ type: 'tracks', tracks: others.flatMap((other) => [...other.tracks.values()]).filter(hears) })
    }
  }
  const remove = (self: Present) => {
    const call = calls.get(self.member.call)
    if (call?.get(self.member.member) !== self) return
    clearTimeout(self.away)
    call.delete(self.member.member)
    if (call.size === 0) calls.delete(self.member.call)
    announce(self.member.call)
  }

  const open = (member: CallMember, link: MemberLink): MemberSession => {
    const self: Present = { member, link, tracks: new Map() }

    // The member, in the call once more: a socket of theirs still there is replaced.
    const enter = () => {
      const call = calls.get(member.call) ?? new Map<string, Present>()
      calls.set(member.call, call)
      const before = call.get(member.member)
      call.set(member.member, self)
      if (before) {
        clearTimeout(before.away)
        if (!before.away) {
          before.link.send({ type: 'left', reason: 'removed' })
          before.link.close(1000, 'left')
        }
      }
    }

    const receive = (message: CallClientMessage) => {
      switch (message.type) {
        case 'join':
        case 'resume':
          if (message.type === 'resume') {
            for (const track of message.tracks) self.tracks.set(track.sid, { sid: track.sid, member: member.member, kind: track.kind, source: track.source, muted: false })
          }
          enter()
          link.send(message.type === 'join' ? { type: 'joined', mode: 'peer', participant: member.member, iceServers: settings.iceServers ?? [] } : { type: 'resumed' })
          return announce(member.call)
        case 'publish':
          // The browser's own track ids name the tracks: the receiving browser sees the same id.
          for (const track of message.tracks) self.tracks.set(track.cid, { sid: track.cid, member: member.member, kind: track.kind, source: track.source, muted: false })
          link.send({ type: 'published', tracks: message.tracks.map((track) => ({ cid: track.cid, sid: track.cid })) })
          return announce(member.call)
        case 'unpublish':
          self.tracks.delete(message.sid)
          return announce(member.call)
        case 'mute': {
          const track = self.tracks.get(message.sid)
          if (!track) return
          track.muted = message.muted
          return announce(member.call)
        }
        case 'signal': {
          const to = calls.get(member.call)?.get(message.to)
          if (!to || to.away || to === self) return
          to.link.send({ type: 'signal', from: member.member, ...(message.description && { description: message.description }), ...(message.candidate && { candidate: message.candidate }) })
          return
        }
        case 'leave':
          return link.close(1000, 'left')
        // Negotiation with a media server, which this plugin has none of.
        case 'offer':
        case 'candidate':
        case 'view':
          return
      }
    }

    return {
      receive,
      end: (how) => {
        if (how === 'left') return remove(self)
        // Lost: the others keep their connections to the member, whose browser resumes in a moment, or is gone.
        if (calls.get(member.call)?.get(member.member) !== self) return
        self.away = setTimeout(() => remove(self), awayMs)
      },
    }
  }

  return { open }
}
