import type { CallClientMessage, CallRemoteTrack } from '@protobase/schema/internal'
import type { PeerBackend } from '../calls-options'
import type { MediaBackend } from '../media-backend'

/**
 * The peer plugin: no media server. Protobase passes each member's descriptions and candidates to the member they name
 * in the same call, and tells every member who else is in it and which of their tracks they hear; the browsers send
 * their media to each other directly. Who is in the call, and the tracks each sends, are the call's record.
 */
export const peerBackend = (settings: PeerBackend): MediaBackend => ({
  open: (member, link, room) => {
    const own = new Map<string, CallRemoteTrack>()
    const keep = (sid: string, kind: CallRemoteTrack['kind'], source: CallRemoteTrack['source']) => own.set(sid, { sid, member: member.member, kind, source, muted: false })
    const share = () => room.tracks([...own.values()])

    const receive = async (message: CallClientMessage) => {
      switch (message.type) {
        case 'join':
          link.send({ type: 'joined', call: room.call, mode: 'peer', participant: member.member, iceServers: settings.iceServers ?? [] })
          return
        // The call's record took the tracks of the resume as the member came in again.
        case 'resume':
          for (const track of message.tracks) keep(track.sid, track.kind, track.source)
          link.send({ type: 'resumed' })
          return
        case 'publish':
          // The ids the browser names its tracks by in its descriptions, which the receiving browser sees too.
          for (const track of message.tracks) keep(track.cid, track.kind, track.source)
          link.send({ type: 'published', tracks: message.tracks.map((track) => ({ cid: track.cid, sid: track.cid })) })
          return share()
        case 'unpublish':
          own.delete(message.sid)
          return share()
        case 'mute': {
          const track = own.get(message.sid)
          if (!track) return
          track.muted = message.muted
          return share()
        }
        case 'signal':
          return room.signal(message.to, { ...(message.description && { description: message.description }), ...(message.candidate && { candidate: message.candidate }) })
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
      // The call's record keeps the member in it, through a lost socket too: nothing of the plugin's to end.
      end: () => {},
      roster: (members) => {
        const others = members.filter((other) => other.member !== member.member)
        const hears = member.hears ?? (() => true)
        link.send({ type: 'peers', members: others.map((other) => other.member) })
        link.send({ type: 'tracks', tracks: others.flatMap((other) => other.tracks).filter(hears) })
      },
    }
  },
})
