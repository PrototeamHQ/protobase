import { connect, type ClientHttp2Session } from 'node:http2'
import { apnsSender } from '../../packages/server/src/notifications/apns/apns-sender'
import type { ApnsSettings } from '../../packages/server/src/notifications/apns/apns-settings'
import type { Device } from '../../packages/server/src/notifications/device'
import type { PushMessage } from '../../packages/server/src/notifications/message'
import { keptRequestHeaders } from './scrub'

/** A request the APNs sender made and APNs's answer to it, with only the headers `keptRequestHeaders` names. */
export type ApnsRecording = {
  nowSeconds: number
  topic: string
  message: PushMessage
  device: Pick<Device, 'token' | 'environment' | 'userId'>
  answers: { result: string }[]
  request: { origin: string; headers: Record<string, string>; body: string }
  response: { status: number; body: string }
}

/** The message every recording sends. */
export const recordedMessage: PushMessage = { title: 'Recorded', body: 'From the APNs sandbox', url: 'https://example.com/recorded', tag: 'recorded', ttl: 60, urgency: 'normal' }

/** A token of no device: APNs knows it for none, so a recording reaches no one. */
export const noDeviceToken = '0'.repeat(64)

// The sender's own connect, verifying APNs's certificate, with what it sends and gets kept for the recording.
const recordingConnect = (into: Pick<ApnsRecording, 'request' | 'response'>) => (origin: string) => {
  const session: ClientHttp2Session = connect(origin)
  const request = session.request.bind(session)
  session.request = ((headers, options) => {
    const stream = request(headers, options)
    into.request.origin = origin
    for (const [name, value] of Object.entries(headers ?? {})) if (keptRequestHeaders.has(name)) into.request.headers[name] = String(value)
    const write = stream.end.bind(stream)
    stream.end = ((chunk: unknown, ...rest: unknown[]) => {
      if (typeof chunk === 'string') into.request.body = chunk
      return write(chunk as never, ...(rest as []))
    }) as typeof stream.end
    stream.on('response', (answer) => (into.response.status = Number(answer[':status'])))
    stream.on('data', (chunk: Buffer) => (into.response.body += chunk.toString()))
    return stream
  }) as typeof session.request
  return session
}

/** Sends the recorded message to `noDeviceToken` in the sandbox through the APNs sender, as `settings` sign it, and records it. */
export const recordApns = async (settings: ApnsSettings, topic: string, now = Date.now()): Promise<ApnsRecording> => {
  const into = { request: { origin: '', headers: {}, body: '' }, response: { status: 0, body: '' } }
  const sender = apnsSender(settings, { appId: topic, connect: recordingConnect(into), now: () => now })
  const device: Device = { id: 'recorded', userId: 'recorded-user', kind: 'apns', token: noDeviceToken, p256dh: null, auth: null, environment: 'sandbox', appId: topic, userAgent: null, sessionId: null, createdAt: new Date(now), lastSeenAt: new Date(now) }
  const answers = await sender.send(recordedMessage, [device])
  return { nowSeconds: Math.floor(now / 1000), topic, message: recordedMessage, device: { token: device.token, environment: device.environment, userId: device.userId }, answers: answers.map(({ result }) => ({ result })), ...into }
}
