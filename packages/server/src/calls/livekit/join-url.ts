import { ClientInfo, ClientInfo_SDK, ConnectionSettings, JoinRequest, WrappedJoinRequest, WrappedJoinRequest_Compression } from '@livekit/protocol'

/**
 * The LiveKit signal protocol version the bridge speaks, pinned: the server keeps every older version working for the
 * clients in the field, and 18 changes data channels, which the bridge does not use.
 */
export const liveKitProtocol = 17

/** The bridge as LiveKit's client info names it. */
const clientInfo = () => new ClientInfo({ sdk: ClientInfo_SDK.UNKNOWN, protocol: liveKitProtocol, version: 'protobase-calls-1' })

/** A join of a new member, or with `resume` of the participant it names. */
export type JoinOptions = { resume?: { participant: string } }

/**
 * The single peer connection signal endpoint (`/rtc/v1`) with the member's token and join request. The request is
 * standard base64 with `+` and `/` replaced and the `=` padding kept, which LiveKit's decoder needs.
 */
export const joinUrl = (base: string, token: string, { resume }: JoinOptions) => {
  const join = new JoinRequest({
    clientInfo: clientInfo(),
    // Protobase decides who hears whom: nothing is subscribed until the session asks for it.
    connectionSettings: new ConnectionSettings({ autoSubscribe: false, adaptiveStream: false }),
    reconnect: resume !== undefined,
    participantSid: resume?.participant ?? '',
  })
  const wrapped = new WrappedJoinRequest({ compression: WrappedJoinRequest_Compression.NONE, joinRequest: join.toBinary() })
  const encoded = Buffer.from(wrapped.toBinary()).toString('base64').replaceAll('+', '-').replaceAll('/', '_')
  const url = new URL('rtc/v1', `${base.replace(/\/+$/, '')}/`)
  url.searchParams.set('access_token', token)
  url.searchParams.set('join_request', encoded)
  return url.href
}
