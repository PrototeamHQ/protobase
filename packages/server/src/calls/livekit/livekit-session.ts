import {
  AddTrackRequest,
  DisconnectReason,
  LeaveRequest,
  LeaveRequest_Action,
  MuteTrackRequest,
  ParticipantInfo_State,
  RequestResponse_Reason,
  SessionDescription,
  SignalTarget,
  SyncState,
  TrackInfo,
  TrackPublishedResponse,
  TrackType,
  TrickleRequest,
  UpdateSubscription,
  UpdateTrackSettings,
  VideoLayer,
  type ParticipantInfo,
} from '@livekit/protocol'
import type { CallClientMessage, CallLeftReason, CallResume, CallServerMessage, CallTrackRequest } from '@protobase/schema/internal'
import type { LiveKitBackend } from '../calls-options'
import type { CallMember } from '../call-member'
import { resumeCloseCode, type MediaBackend, type MemberLink, type MemberSession } from '../media-backend'
import { joinUrl, type JoinOptions } from './join-url'
import { liveKitToken } from './livekit-token'
import { openSignalSocket, type SignalMessage, type SignalSocket, type SignalSocketInput } from './signal-socket'
import { grantSources, liveKitQuality, liveKitSource, remoteTracksOf } from './track-mapping'

/** How long the media server has to accept a track before the publish is refused. */
const publishTimeoutMs = 10_000

/** LiveKit's own ping defaults, for a resumed session, whose answer carries none. */
const resumePing = { interval: 5, timeout: 15 }

export type LiveKitDeps = { connect: (input: SignalSocketInput) => SignalSocket }

const leftReason = (leave: LeaveRequest): CallLeftReason => {
  if (leave.action === LeaveRequest_Action.RECONNECT) return 'rejoin'
  if (leave.reason === DisconnectReason.PARTICIPANT_REMOVED || leave.reason === DisconnectReason.DUPLICATE_IDENTITY) return 'removed'
  return 'ended'
}

const syncState = (resume: CallResume & { offer: string; answer: string }) =>
  new SyncState({
    offer: new SessionDescription({ type: 'offer', sdp: resume.offer }),
    answer: new SessionDescription({ type: 'answer', sdp: resume.answer }),
    publishTracks: resume.tracks.map(
      (track) => new TrackPublishedResponse({ cid: track.cid, track: new TrackInfo({ sid: track.sid, type: track.kind === 'audio' ? TrackType.AUDIO : TrackType.VIDEO }) }),
    ),
    subscription: new UpdateSubscription({ subscribe: true, trackSids: [] }),
  })

const addTrackRequest = (track: CallTrackRequest) =>
  new AddTrackRequest({
    cid: track.cid,
    name: track.source,
    type: track.kind === 'audio' ? TrackType.AUDIO : TrackType.VIDEO,
    source: liveKitSource(track.source),
    width: track.width ?? 0,
    height: track.height ?? 0,
    layers: (track.layers ?? []).map((layer) => new VideoLayer({ quality: liveKitQuality(layer.quality), width: layer.width, height: layer.height, bitrate: layer.bitrate })),
  })

/**
 * One member's LiveKit signal session, in this process: the browser's call messages become LiveKit's signal requests,
 * and LiveKit's answers, candidates and room changes become call messages. Protobase decides who hears what: nothing is
 * subscribed until `hears` admits it. The session keeps nothing a new one could not rebuild from the browser's `resume`,
 * so a member moves to another session, or process, without losing media.
 */
const liveKitSession = (backend: LiveKitBackend, member: CallMember, link: MemberLink, deps: LiveKitDeps): MemberSession => {
  const hears = member.hears ?? (() => true)
  let signal: SignalSocket | undefined
  let finished = false
  const participants = new Map<string, ParticipantInfo>()
  const heard = new Set<string>()
  const publishing = new Map<string, { resolve: (sid: string) => void; reject: (reason: string) => void }>()

  const toBrowser = (message: CallServerMessage) => link.send(message)

  // The session is over for this socket: the member left, was refused, or must resume or rejoin on a new one.
  const finish = (code: number, reason: string) => {
    if (finished) return
    finished = true
    signal?.close()
    for (const pending of publishing.values()) pending.reject('The call session ended')
    link.close(code, reason)
  }
  const leave = () => {
    signal?.send({ case: 'leave', value: new LeaveRequest({ reason: DisconnectReason.CLIENT_INITIATED, action: LeaveRequest_Action.DISCONNECT }) })
    finish(1000, 'left')
  }

  // The tracks the member hears, subscribed in LiveKit as they appear; the browser gets the full list on every change.
  const updateTracks = () => {
    const tracks = remoteTracksOf([...participants.values()]).filter(hears)
    const added = tracks.filter((track) => !heard.has(track.sid)).map((track) => track.sid)
    const current = new Set(tracks.map((track) => track.sid))
    for (const sid of heard) if (!current.has(sid)) heard.delete(sid)
    for (const sid of added) heard.add(sid)
    if (added.length > 0) signal?.send({ case: 'subscription', value: new UpdateSubscription({ trackSids: added, subscribe: true }) })
    toBrowser({ type: 'tracks', tracks })
  }
  const updateParticipants = (infos: ParticipantInfo[], self: string) => {
    for (const info of infos) {
      if (info.identity === self) continue
      if (info.state === ParticipantInfo_State.DISCONNECTED) participants.delete(info.sid)
      else participants.set(info.sid, info)
    }
    updateTracks()
  }

  const onSignal = (message: SignalMessage) => {
    switch (message.case) {
      case 'join': {
        const join = message.value
        signal!.keepAlive(join.pingInterval || resumePing.interval, join.pingTimeout || resumePing.timeout)
        toBrowser({
          type: 'joined',
          mode: 'sfu',
          participant: join.participant!.sid,
          iceServers: join.iceServers.map((server) => ({ urls: server.urls, ...(server.username && { username: server.username, credential: server.credential }) })),
        })
        updateParticipants(join.otherParticipants, member.member)
        return
      }
      case 'reconnect':
        signal!.keepAlive(resumePing.interval, resumePing.timeout)
        toBrowser({ type: 'resumed' })
        return
      case 'answer':
        toBrowser({ type: 'answer', sdp: message.value.sdp, id: message.value.id, mids: message.value.midToTrackId })
        return
      case 'trickle':
        toBrowser({ type: 'candidate', candidate: JSON.parse(message.value.candidateInit) })
        return
      case 'mediaSectionsRequirement':
        toBrowser({ type: 'sections', audio: message.value.numAudios, video: message.value.numVideos })
        return
      case 'update':
        updateParticipants(message.value.participants, member.member)
        return
      case 'trackPublished':
        publishing.get(message.value.cid)?.resolve(message.value.track!.sid)
        return
      case 'requestResponse': {
        const { request, reason, message: why } = message.value
        if (request.case === 'addTrack' && reason !== RequestResponse_Reason.OK) publishing.get(request.value.cid)?.reject(why || RequestResponse_Reason[reason])
        return
      }
      case 'trackUnpublished':
        toBrowser({ type: 'unpublished', sid: message.value.trackSid })
        return
      case 'speakersChanged':
        toBrowser({
          type: 'speakers',
          speakers: message.value.speakers.flatMap((speaker) => {
            const info = participants.get(speaker.sid)
            return info ? [{ member: info.identity, level: speaker.active ? speaker.level : 0 }] : []
          }),
        })
        return
      case 'leave': {
        const leave = message.value
        if (leave.action === LeaveRequest_Action.RESUME) return finish(resumeCloseCode, 'resume')
        toBrowser({ type: 'left', reason: leftReason(leave) })
        return finish(1000, 'left')
      }
    }
  }

  const connect = async (options: JoinOptions) => {
    const canPublish = member.publish !== false && !(Array.isArray(member.publish) && member.publish.length === 0)
    const token = await liveKitToken(backend, {
      room: member.call,
      identity: member.member,
      canPublish,
      ...(Array.isArray(member.publish) && { canPublishSources: member.publish.map((source) => grantSources[source]) }),
    })
    signal = deps.connect({
      url: joinUrl(backend.url.replace(/^http/, 'ws'), token, options),
      onMessage: onSignal,
      // Lost without a leave: the browser resumes on a new socket, which may reach another process.
      onClose: () => finish(resumeCloseCode, 'resume'),
    })
  }

  const publish = async (tracks: CallTrackRequest[]) => {
    const published = tracks.map(
      (track) =>
        new Promise<{ cid: string; sid: string }>((resolve, reject) => {
          const timer = setTimeout(() => reject('The media server did not accept the track in time'), publishTimeoutMs)
          const settle = () => {
            clearTimeout(timer)
            publishing.delete(track.cid)
          }
          publishing.set(track.cid, { resolve: (sid) => (settle(), resolve({ cid: track.cid, sid })), reject: (reason) => (settle(), reject(reason)) })
          signal!.send({ case: 'addTrack', value: addTrackRequest(track) })
        }),
    )
    const settled = await Promise.allSettled(published)
    const refused = settled.find((result) => result.status === 'rejected')
    if (refused) return toBrowser({ type: 'publish-refused', reason: String(refused.reason) })
    toBrowser({ type: 'published', tracks: settled.map((result) => (result as PromiseFulfilledResult<{ cid: string; sid: string }>).value) })
  }

  const receive = async (message: CallClientMessage) => {
    if (message.type === 'join') return connect({})
    if (message.type === 'resume') {
      // Without its descriptions the media server cannot take the member back: the browser joins anew.
      if (!message.offer || !message.answer) {
        toBrowser({ type: 'left', reason: 'rejoin' })
        return finish(1000, 'left')
      }
      await connect({ resume: { participant: message.participant } })
      signal!.send({ case: 'syncState', value: syncState({ ...message, offer: message.offer, answer: message.answer }) })
      return
    }
    if (!signal || finished) return
    switch (message.type) {
      case 'publish':
        return publish(message.tracks)
      case 'offer':
        return signal.send({ case: 'offer', value: new SessionDescription({ type: 'offer', sdp: message.sdp, id: message.id }) })
      case 'candidate':
        return signal.send({ case: 'trickle', value: new TrickleRequest({ candidateInit: JSON.stringify(message.candidate), target: SignalTarget.PUBLISHER }) })
      case 'mute':
        return signal.send({ case: 'mute', value: new MuteTrackRequest({ sid: message.sid, muted: message.muted }) })
      case 'view': {
        const sids = message.sids.filter((sid) => heard.has(sid))
        if (sids.length === 0) return
        return signal.send({ case: 'trackSetting', value: new UpdateTrackSettings({ trackSids: sids, disabled: message.hidden ?? false, width: message.width, height: message.height }) })
      }
      case 'leave':
        return leave()
    }
  }

  return {
    receive,
    end: (how) => {
      if (finished) return
      finished = true
      // Out of the call: the member leaves the media session too. Otherwise the browser may resume, on any process.
      if (how === 'left') signal?.send({ case: 'leave', value: new LeaveRequest({ reason: DisconnectReason.PARTICIPANT_REMOVED, action: LeaveRequest_Action.DISCONNECT }) })
      signal?.close()
      for (const pending of publishing.values()) pending.reject('The call session ended')
    },
  }
}

/** The LiveKit plugin: each member's signal session to a LiveKit server, self-hosted or LiveKit Cloud. */
export const liveKitBackend = (settings: LiveKitBackend, deps: LiveKitDeps = { connect: openSignalSocket }): MediaBackend => ({
  open: (member, link) => liveKitSession(settings, member, link, deps),
})
