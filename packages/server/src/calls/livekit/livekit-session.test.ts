import {
  JoinResponse,
  LeaveRequest,
  LeaveRequest_Action,
  ParticipantInfo,
  ParticipantInfo_State,
  ParticipantUpdate,
  RequestResponse,
  RequestResponse_Reason,
  SessionDescription,
  SpeakersChanged,
  SpeakerInfo,
  TrackInfo,
  TrackPublishedResponse,
  TrackSource,
  TrackType,
  WrappedJoinRequest,
  JoinRequest,
  AddTrackRequest,
  type SignalRequest,
} from '@livekit/protocol'
import { decodeJwt } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import type { CallServerMessage } from '@protobase/schema/internal'
import type { FunctionSocket } from '../../functions/function-socket'
import type { SessionMember } from '../call-member'
import { callHub } from '../call-hub'
import { memoryCallStore } from '../testing/memory-call-store'
import { standup } from '../testing/call-harness'
import { resumeCloseCode } from '../media-backend'
import { memberRelay } from '../member-relay'
import { liveKitBackend } from './livekit-session'
import type { SignalMessage, SignalSocketInput } from './signal-socket'

const backend = { kind: 'livekit' as const, url: 'http://livekit.test', apiKey: 'key', apiSecret: 'secret-secret-secret-secret-secret-secret' }

// A member's socket through the relay to the LiveKit plugin, over a fake signal socket and a fake browser socket, which
// keep what each was sent.
const session = async (member: Partial<SessionMember> = {}) => {
  const requests: SignalRequest['message'][] = []
  const signal = { send: vi.fn((message: SignalRequest['message']) => void requests.push(message)), keepAlive: vi.fn(), close: vi.fn() }
  let input: SignalSocketInput | undefined
  const plugin = liveKitBackend(backend, {
    connect: (given: SignalSocketInput) => {
      input = given
      return signal
    },
  })
  const store = memoryCallStore()
  const { publish = true, hears } = member
  const events = memberRelay({ door: callHub({ store, manyProcesses: false, report: vi.fn() }), backend: plugin, record: standup, member: 'ann', rights: { publish, ...(hears && { hears }) }, maxMembers: Number.POSITIVE_INFINITY, maxMinutes: 60, report: vi.fn() })
  const sent: CallServerMessage[] = []
  const browser = { send: vi.fn(async (data: string | ArrayBuffer | Uint8Array) => void sent.push(JSON.parse(String(data)))), close: vi.fn(), bufferedAmount: 0 } satisfies FunctionSocket
  await events.onOpen!(browser)
  const fromBrowser = (message: object) => events.onMessage!(JSON.stringify(message), browser)
  const fromLiveKit = (message: SignalMessage) => input!.onMessage(message)
  return { events, browser, signal, requests, sent, fromBrowser, fromLiveKit, input: () => input!, store }
}

const participant = (sid: string, identity: string, tracks: Partial<TrackInfo>[], state = ParticipantInfo_State.ACTIVE) =>
  new ParticipantInfo({ sid, identity, state, tracks: tracks.map((track) => new TrackInfo(track)) })

const joinResponse = (others: ParticipantInfo[] = []) =>
  ({ case: 'join', value: new JoinResponse({ participant: new ParticipantInfo({ sid: 'PA_ann', identity: 'ann' }), otherParticipants: others, pingInterval: 5, pingTimeout: 15 }) }) satisfies SignalMessage

const bobsCamera = { sid: 'TR_cam', type: TrackType.VIDEO, source: TrackSource.CAMERA }
const bobsMicrophone = { sid: 'TR_mic', type: TrackType.AUDIO, source: TrackSource.MICROPHONE, muted: true }

describe('a member\'s LiveKit session through the relay', () => {
  it('joins with a token for the member and the room, without subscribing to anything', async () => {
    const { fromBrowser, input } = await session({ publish: ['microphone'] })
    await fromBrowser({ type: 'join' })
    const url = new URL(input().url)
    expect(`${url.origin}${url.pathname}`).toBe('ws://livekit.test/rtc/v1')
    expect(decodeJwt(url.searchParams.get('access_token')!)).toMatchObject({
      iss: 'key',
      sub: 'ann',
      video: { room: expect.stringMatching(/^[0-9a-f-]{36}$/), roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: ['microphone'] },
    })
    const wrapped = WrappedJoinRequest.fromBinary(Buffer.from(url.searchParams.get('join_request')!, 'base64'))
    const join = JoinRequest.fromBinary(wrapped.joinRequest)
    expect(join.connectionSettings?.autoSubscribe).toBe(false)
    expect(join.clientInfo?.protocol).toBe(17)
    expect(join.reconnect).toBe(false)
  })

  it('tells the browser it joined, and subscribes to the tracks the member hears', async () => {
    const { fromBrowser, fromLiveKit, signal, sent, requests } = await session({ hears: (track) => track.kind === 'video' })
    await fromBrowser({ type: 'join' })
    fromLiveKit(joinResponse([participant('PA_bob', 'bob', [bobsCamera, bobsMicrophone])]))
    expect(signal.keepAlive).toHaveBeenCalledWith(5, 15)
    expect(sent).toEqual([
      { type: 'members', members: [{ member: 'ann', joined_at: expect.any(String) }] },
      { type: 'joined', call: expect.stringMatching(/^[0-9a-f-]{36}$/), mode: 'sfu', participant: 'PA_ann', iceServers: [] },
      { type: 'tracks', tracks: [{ sid: 'TR_cam', member: 'bob', kind: 'video', source: 'camera', muted: false }] },
    ])
    expect(requests).toEqual([expect.objectContaining({ case: 'subscription', value: expect.objectContaining({ trackSids: ['TR_cam'], subscribe: true }) })])
  })

  it('subscribes to a track once, and drops a member who left from the tracks', async () => {
    const { fromBrowser, fromLiveKit, sent, requests } = await session()
    await fromBrowser({ type: 'join' })
    fromLiveKit(joinResponse([participant('PA_bob', 'bob', [bobsCamera])]))
    fromLiveKit({ case: 'update', value: new ParticipantUpdate({ participants: [participant('PA_bob', 'bob', [bobsCamera, bobsMicrophone])] }) })
    fromLiveKit({ case: 'update', value: new ParticipantUpdate({ participants: [participant('PA_bob', 'bob', [], ParticipantInfo_State.DISCONNECTED)] }) })
    expect(requests.filter((request) => request.case === 'subscription').map((request) => (request.value as { trackSids: string[] }).trackSids)).toEqual([['TR_cam'], ['TR_mic']])
    expect(sent.at(-1)).toEqual({ type: 'tracks', tracks: [] })
  })

  it('names the speakers by their members', async () => {
    const { fromBrowser, fromLiveKit, sent } = await session()
    await fromBrowser({ type: 'join' })
    fromLiveKit(joinResponse([participant('PA_bob', 'bob', [])]))
    fromLiveKit({ case: 'speakersChanged', value: new SpeakersChanged({ speakers: [new SpeakerInfo({ sid: 'PA_bob', level: 0.5, active: true }), new SpeakerInfo({ sid: 'PA_gone', level: 1, active: true })] }) })
    expect(sent.at(-1)).toEqual({ type: 'speakers', speakers: [{ member: 'bob', level: 0.5 }] })
  })

  it('publishes a track once LiveKit accepted it', async () => {
    const { fromBrowser, fromLiveKit, sent, requests } = await session()
    await fromBrowser({ type: 'join' })
    const published = fromBrowser({ type: 'publish', tracks: [{ cid: 'cam-1', kind: 'video', source: 'camera', width: 640, height: 360 }] })
    expect(requests.at(-1)).toEqual({ case: 'addTrack', value: expect.objectContaining({ cid: 'cam-1', type: TrackType.VIDEO, source: TrackSource.CAMERA, width: 640, height: 360 }) })
    fromLiveKit({ case: 'trackPublished', value: new TrackPublishedResponse({ cid: 'cam-1', track: new TrackInfo({ sid: 'TR_1' }) }) })
    await published
    expect(sent.at(-1)).toEqual({ type: 'published', tracks: [{ cid: 'cam-1', sid: 'TR_1' }] })
  })

  it('refuses a publish LiveKit refused', async () => {
    const { fromBrowser, fromLiveKit, sent } = await session()
    await fromBrowser({ type: 'join' })
    const published = fromBrowser({ type: 'publish', tracks: [{ cid: 'mic-1', kind: 'audio', source: 'microphone' }] })
    fromLiveKit({ case: 'requestResponse', value: new RequestResponse({ reason: RequestResponse_Reason.NOT_ALLOWED, message: 'not allowed', request: { case: 'addTrack', value: new AddTrackRequest({ cid: 'mic-1' }) } }) })
    await published
    expect(sent.at(-1)).toEqual({ type: 'publish-refused', reason: 'not allowed' })
  })

  it('refuses a publish of a source the member may not send, without asking LiveKit', async () => {
    const { fromBrowser, sent, requests } = await session({ publish: ['microphone'] })
    await fromBrowser({ type: 'join' })
    await fromBrowser({ type: 'publish', tracks: [{ cid: 'cam-1', kind: 'video', source: 'camera' }] })
    expect(sent.at(-1)).toEqual({ type: 'publish-refused', reason: 'The member may not publish these tracks' })
    expect(requests.some((request) => request.case === 'addTrack')).toBe(false)
  })

  it('relays offers, answers and candidates', async () => {
    const { fromBrowser, fromLiveKit, sent, requests } = await session()
    await fromBrowser({ type: 'join' })
    await fromBrowser({ type: 'offer', sdp: 'v=0 offer', id: 1 })
    await fromBrowser({ type: 'candidate', candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } })
    fromLiveKit({ case: 'answer', value: new SessionDescription({ type: 'answer', sdp: 'v=0 answer', id: 1, midToTrackId: { '1': 'TR_cam' } }) })
    fromLiveKit({ case: 'trickle', value: { candidateInit: '{"candidate":"candidate:2","sdpMid":"0"}', target: 0, final: false } as never })
    expect(requests.slice(-2)).toEqual([
      { case: 'offer', value: expect.objectContaining({ type: 'offer', sdp: 'v=0 offer', id: 1 }) },
      { case: 'trickle', value: expect.objectContaining({ candidateInit: '{"candidate":"candidate:1","sdpMid":"0","sdpMLineIndex":0}' }) },
    ])
    expect(sent.slice(-2)).toEqual([
      { type: 'answer', sdp: 'v=0 answer', id: 1, mids: { '1': 'TR_cam' } },
      { type: 'candidate', candidate: { candidate: 'candidate:2', sdpMid: '0' } },
    ])
  })

  it('resumes the participant from the browser\'s state', async () => {
    const { fromBrowser, fromLiveKit, input, requests, sent, store } = await session()
    const before = await store.admit({ record: standup, member: 'ann', process: 'before', maxMembers: 8, maxMinutes: 60 })
    await fromBrowser({ type: 'resume', call: 'call' in before ? before.call : '',  participant: 'PA_ann', offer: 'v=0 offer', answer: 'v=0 answer', tracks: [{ cid: 'cam-1', sid: 'TR_1', kind: 'video', source: 'camera' }] })
    const join = JoinRequest.fromBinary(WrappedJoinRequest.fromBinary(Buffer.from(new URL(input().url).searchParams.get('join_request')!, 'base64')).joinRequest)
    expect(join).toMatchObject({ reconnect: true, participantSid: 'PA_ann' })
    expect(requests).toEqual([{ case: 'syncState', value: expect.objectContaining({ offer: expect.objectContaining({ sdp: 'v=0 offer' }), answer: expect.objectContaining({ sdp: 'v=0 answer' }) }) }])
    fromLiveKit({ case: 'reconnect', value: {} as never })
    expect(sent).toEqual([{ type: 'members', members: [{ member: 'ann', joined_at: expect.any(String) }] }, { type: 'resumed' }])
  })

  it('leaves LiveKit when the member leaves', async () => {
    const { fromBrowser, browser, signal, requests } = await session()
    await fromBrowser({ type: 'join' })
    await fromBrowser({ type: 'leave' })
    expect(requests.at(-1)).toEqual({ case: 'leave', value: expect.objectContaining({ action: LeaveRequest_Action.DISCONNECT }) })
    expect(signal.close).toHaveBeenCalled()
    expect(browser.close).toHaveBeenCalledWith(1000, 'left')
  })

  it('leaves LiveKit when Protobase refused the caller, and only then', async () => {
    const refused = await session()
    await refused.fromBrowser({ type: 'join' })
    await refused.events.onClose!(1008, 'Policy Violation')
    expect(refused.requests.at(-1)?.case).toBe('leave')

    const lost = await session()
    await lost.fromBrowser({ type: 'join' })
    await lost.events.onClose!(1006, '')
    expect(lost.requests.some((request) => request.case === 'leave')).toBe(false)
    expect(lost.signal.close).toHaveBeenCalled()
  })

  it('has the browser resume when the signal socket is lost, and rejoin when LiveKit asks', async () => {
    const lost = await session()
    await lost.fromBrowser({ type: 'join' })
    lost.input().onClose()
    expect(lost.browser.close).toHaveBeenCalledWith(resumeCloseCode, 'resume')

    const rejoin = await session()
    await rejoin.fromBrowser({ type: 'join' })
    rejoin.fromLiveKit({ case: 'leave', value: new LeaveRequest({ action: LeaveRequest_Action.RECONNECT }) })
    expect(rejoin.sent.at(-1)).toEqual({ type: 'left', reason: 'rejoin' })
    expect(rejoin.browser.close).toHaveBeenCalledWith(1000, 'left')
  })

  it('closes a socket that sends anything but call messages, or before joining', async () => {
    const garbage = await session()
    await garbage.events.onMessage!('{"type":"dance"}', garbage.browser)
    expect(garbage.browser.close).toHaveBeenCalledWith(1008, 'Not a call message')

    const early = await session()
    await early.fromBrowser({ type: 'offer', sdp: 'v=0', id: 1 })
    expect(early.browser.close).toHaveBeenCalledWith(1008, 'Join or resume the call first')
  })
})
