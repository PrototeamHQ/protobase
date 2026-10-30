// The call protocol between a browser's media link and the Protobase server, as JSON over the socket of the function
// that admitted the member. The browser runs plain WebRTC; Protobase relays its offers, answers and candidates either to
// a media server plugin on the member's behalf (`sfu`: the browser always offers, one peer connection) or to the other
// members' browsers (`peer`: one peer connection per member). Media never passes through Protobase, which decides who is
// in the call and who hears whom.

/** What a published track carries. */
export type CallTrackSource = 'camera' | 'microphone' | 'screen' | 'screen-audio'

/** One simulcast layer of a published video track, as the browser encodes it. */
export type CallVideoLayer = { quality: 'low' | 'medium' | 'high'; width: number; height: number; bitrate: number }

/**
 * A track the browser is about to send: `cid` is the id its description names it by in `msid`, its `MediaStreamTrack.id`
 * to a media server, the id of the stream it is sent on to other members (`peer`).
 */
export type CallTrackRequest = {
  cid: string
  kind: 'audio' | 'video'
  source: CallTrackSource
  width?: number
  height?: number
  layers?: CallVideoLayer[]
}

/** An ICE candidate as `RTCIceCandidate.toJSON()` writes it. */
export type CallCandidate = { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null }

/** What the browser hands a new server session so it resumes the member's media session where the last one left it. */
export type CallResume = {
  /** The call the member is in, from `joined`: a resume of a call that ended is refused. */
  call: string
  /** The member's participant in the media server, from `joined`. */
  participant: string
  /** The browser's current local (offer) and remote (answer) descriptions, with a media server. */
  offer?: string
  answer?: string
  /** The member's published tracks. */
  tracks: { cid: string; sid: string; kind: 'audio' | 'video'; source: CallTrackSource }[]
}

/** A session description as `RTCSessionDescription.toJSON()` writes it. */
export type CallDescription = { type: 'offer' | 'answer'; sdp: string }

/** How the call's media flows: through a media server, or directly between the members' browsers. */
export type CallMode = 'sfu' | 'peer'

/** A message from the browser. `guest` is a guest's token, on the guest call socket only. */
export type CallClientMessage =
  | { type: 'join'; guest?: string }
  | ({ type: 'resume'; guest?: string } & CallResume)
  | { type: 'publish'; tracks: CallTrackRequest[] }
  | { type: 'offer'; sdp: string; id: number }
  | { type: 'candidate'; candidate: CallCandidate }
  | { type: 'unpublish'; sid: string }
  | { type: 'mute'; sid: string; muted: boolean }
  /** With `peer`: a description or candidate for another member's browser. */
  | { type: 'signal'; to: string; description?: CallDescription; candidate?: CallCandidate }
  /** How large the browser shows remote video tracks, so the media server forwards the layer that fits; or not at all. */
  | { type: 'view'; sids: string[]; width: number; height: number; hidden?: boolean }
  | { type: 'leave' }
  /** A member who may invite: a new guest link to the call, with the sources a guest may send and when it expires. */
  | { type: 'guest-link'; publish: CallTrackSource[]; expires_at?: string }
  | { type: 'guest-link-revoke'; link: string }
  /** Lets a waiting guest into the call, or turns them away. */
  | { type: 'guest-decide'; guest: string; admit: boolean }
  | { type: 'guest-remove'; guest: string }

/** A track of another member the member hears. */
export type CallRemoteTrack = { sid: string; member: string; kind: 'audio' | 'video'; source: CallTrackSource; muted: boolean }

/**
 * Why the member is no longer in the call: `ended`, `removed`, `full` and `refused` are final, `rejoin` asks the
 * browser to join anew, and `unavailable` is a server that could not take the member in, after the browser tried again.
 */
export type CallLeftReason = 'ended' | 'removed' | 'full' | 'refused' | 'unavailable' | 'rejoin'

/** Someone in a call, since when (ISO 8601), with the name they show: a guest's own, or the one the app gave the member. */
export type CallRosterMember = { member: string; joined_at: string; name?: string }

/** A guest waiting in the lobby of a call, by the name they gave, since when (ISO 8601). */
export type CallLobbyGuest = { guest: string; name: string; since: string }

/** A guest link of a call: who made it, what a guest may send, and until when (ISO 8601) it lets guests in. */
export type CallGuestLink = { id: string; created_by: string; publish: CallTrackSource[]; expires_at: string | null }

/**
 * Why a member's guest request did nothing: the guest or link is gone, the call is full, the organization turned guest
 * links off, the record has no organization to ask, or the member may not invite.
 */
export type CallGuestRefusal = 'gone' | 'full' | 'off' | 'no-organization' | 'not-allowed'

/** A guest's lobby wait: waiting, let in, turned away, or the call or link is over. */
export type CallGuestState = 'waiting' | 'admitted' | 'denied' | 'ended'

/** A message from the server. */
export type CallServerMessage =
  | { type: 'joined'; call: string; mode: CallMode; participant: string; iceServers: { urls: string[]; username?: string; credential?: string }[]; invites?: boolean }
  | { type: 'resumed' }
  | { type: 'published'; tracks: { cid: string; sid: string }[] }
  | { type: 'publish-refused'; reason: string }
  | { type: 'answer'; sdp: string; id: number; mids: Record<string, string> }
  | { type: 'candidate'; candidate: CallCandidate }
  /** The member hears more tracks than the browser's description has receiving sections for: add them and offer. */
  | { type: 'sections'; audio: number; video: number }
  /** Every remote track the member hears, whenever that changes. */
  | { type: 'tracks'; tracks: CallRemoteTrack[] }
  /** The media server stopped one of the member's own tracks, such as after a demotion: stop sending it. */
  | { type: 'unpublished'; sid: string }
  /** Everyone in the call, the member too, in the order they came, whenever that changes. */
  | { type: 'members'; members: CallRosterMember[] }
  /** With `peer`: every other member in the call, whenever that changes. */
  | { type: 'peers'; members: string[] }
  /** With `peer`: a description or candidate from another member's browser. */
  | { type: 'signal'; from: string; description?: CallDescription; candidate?: CallCandidate }
  | { type: 'speakers'; speakers: { member: string; level: number }[] }
  | { type: 'left'; reason: CallLeftReason }
  /** To a member who may invite: who waits in the lobby, and the call's guest links, whenever that changes. */
  | { type: 'lobby'; guests: CallLobbyGuest[]; links: CallGuestLink[] }
  /** The link a `guest-link` made, with its token, which only its maker gets, once. */
  | { type: 'guest-link'; link: CallGuestLink; token: string }
  | { type: 'guest-refused'; reason: CallGuestRefusal }
