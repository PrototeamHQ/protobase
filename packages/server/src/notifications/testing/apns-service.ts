import { generateKeyPairSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { connect, createSecureServer, createServer, type IncomingHttpHeaders, type ServerHttp2Session, type ServerHttp2Stream } from 'node:http2'
import type { AddressInfo } from 'node:net'
import type { Device } from '../device'

/** A `.p8`-style APNs key for tests, as the APNs variables take it. */
export const apnsTestEnv = () => ({
  PROTOBASE_APNS_KEY: generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  PROTOBASE_APNS_KEY_ID: 'ABC123DEFG',
  PROTOBASE_APNS_TEAM_ID: 'TEAM123456',
})

let next = 0
/** An iOS device for tests, of the app `net.example.app`, in the sandbox. */
export const apnsTestDevice = (change: Partial<Device> = {}): Device => ({
  id: `device-${++next}`,
  userId: 'user',
  kind: 'apns',
  token: `${next}`.padStart(64, 'a'),
  p256dh: null,
  auth: null,
  environment: 'sandbox',
  appId: 'net.example.app',
  userAgent: null,
  sessionId: null,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  ...change,
})

export type ApnsRequest = { origin: string; headers: IncomingHttpHeaders; body: string; session: number }
export type ApnsReply = { status: number; reason?: string; headers?: Record<string, string>; delayMs?: number }

/**
 * An APNs stand-in over plain HTTP/2 for tests: it records each request with the origin the sender opened it for and
 * the session it came on, and answers as `reply` says, 200 by default. `connect` opens sessions to it in place of APNs.
 */
export const apnsService = async (reply: (request: ApnsRequest) => ApnsReply | 'destroy' = () => ({ status: 200 })) => {
  const requests: ApnsRequest[] = []
  const origins: string[] = []
  let sessions = 0
  const server = createServer()
  const serverSessions = new Set<ServerHttp2Session>()
  server.on('session', (session) => {
    sessions += 1
    serverSessions.add(session)
    session.on('close', () => serverSessions.delete(session))
  })
  server.on('stream', (stream: ServerHttp2Stream, headers) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => {
      const request = { origin: String(headers['x-origin']), headers, body: Buffer.concat(chunks).toString(), session: sessions }
      requests.push(request)
      const answer = reply(request)
      if (answer === 'destroy') return stream.session?.destroy()
      const respond = () => {
        stream.respond({ ':status': answer.status, 'apns-id': 'id', ...answer.headers })
        stream.end(answer.reason === undefined ? undefined : JSON.stringify({ reason: answer.reason }))
      }
      if (answer.delayMs) setTimeout(respond, answer.delayMs)
      else respond()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port

  // Each session carries the origin it was opened for, so the test sees where the sender meant to go.
  const connectTo = (origin: string) => {
    origins.push(origin)
    const session = connect(`http://127.0.0.1:${port}`)
    const request = session.request.bind(session)
    session.request = ((headers, options) => request({ ...headers, 'x-origin': origin }, options)) as typeof session.request
    return session
  }

  const goaway = () => {
    for (const session of serverSessions) session.goaway()
  }
  const close = async () => {
    for (const session of serverSessions) session.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  return { requests, origins, connect: connectTo, goaway, close, sessions: () => sessions }
}

/** An HTTP/2 server over TLS with a certificate no authority signed, at an `https://localhost` origin. */
export const selfSignedService = async () => {
  const server = createSecureServer({ key: readFileSync(new URL('./self-signed.key', import.meta.url)), cert: readFileSync(new URL('./self-signed.crt', import.meta.url)) })
  let requests = 0
  const sessions = new Set<ServerHttp2Session>()
  server.on('session', (session) => sessions.add(session))
  server.on('stream', (stream) => {
    requests += 1
    stream.respond({ ':status': 200 })
    stream.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `https://localhost:${(server.address() as AddressInfo).port}`
  const close = async () => {
    for (const session of sessions) session.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  return { origin, requests: () => requests, close }
}
