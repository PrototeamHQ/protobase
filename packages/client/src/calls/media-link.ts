import type { CallClientMessage, CallRemoteTrack, CallResume, CallServerMessage, CallTrackSource } from '@protobase/schema/internal'

/** A track of another member, with its media once the browser receives it. */
export type CallTrack = CallRemoteTrack & { track?: MediaStreamTrack }

/** How a published video track is sent: with a media server, simulcast sends it in three sizes the server picks from. */
export type PublishOptions = { simulcast?: boolean }

/** What a media link is made with: how it talks to Protobase and what it tells the page. */
export type MediaLinkInput = {
  iceServers: RTCIceServer[]
  send: (message: CallClientMessage) => void
  onTracks: (tracks: CallTrack[]) => void
  /** The media server stopped sending one of the member's tracks, such as after a demotion. */
  onUnpublished: (source: CallTrackSource) => void
  createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection
}

/**
 * One member's media in a call, over plain `RTCPeerConnection`s: to a media server (`sfuLink`) or to each other member
 * (`peerLink`). Both take the same messages and do the same things for the call; they differ in who answers an offer.
 */
export type MediaLink = {
  /** A message of the server; one at a time, in order. */
  receive: (message: CallServerMessage) => Promise<void>
  publish: (tracks: Partial<Record<CallTrackSource, MediaStreamTrack>>, options?: PublishOptions) => Promise<void>
  unpublish: (source: CallTrackSource) => Promise<void>
  mute: (source: CallTrackSource, muted: boolean) => void
  restartIce: () => Promise<void>
  /** What a new server session needs to resume the link; `undefined` when it cannot, and the member joins anew. */
  resumeState: (participant: string) => Promise<Omit<CallResume, 'call'> | undefined>
  /** After a resume: offers what changed while the session was lost. */
  resumed: () => Promise<void>
  /** The tracks the member sends, by source, to publish again after a rejoin. */
  sending: () => Map<CallTrackSource, { track: MediaStreamTrack; simulcast: boolean }>
  close: () => void
}

export const createPeerConnection = (configuration: RTCConfiguration) => new RTCPeerConnection(configuration)
