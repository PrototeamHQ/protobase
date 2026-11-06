import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { loadSnapshot, type Snapshot } from './snapshots'

/** A request the fake provider took: its path and form fields. */
export type FakeCall = { path: string; form: Record<string, string>; authorization: string | undefined }

const body = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let text = ''
    request.on('data', (chunk: Buffer) => (text += chunk.toString()))
    request.on('end', () => resolve(text))
  })

/**
 * An OAuth 2.0 provider on this machine that answers its token, user and revocation endpoints with the snapshots of
 * `provider`, as `answers` names them by path; the test changes an answer by setting it. It records every call, so a
 * test can count the code exchanges and see which token was revoked.
 */
export const fakeOAuthServer = async (provider = 'google') => {
  const calls: FakeCall[] = []
  const answers: Record<string, string> = { '/token': 'token-code', '/userinfo': 'userinfo', '/revoke': 'revoke-ok' }
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://fake').pathname
    calls.push({ path, form: Object.fromEntries(new URLSearchParams(await body(request))), authorization: request.headers.authorization })
    const answer = answers[path]
    if (!answer) return void response.writeHead(404).end()
    const snapshot: Snapshot = loadSnapshot(provider, answer)
    response.writeHead(snapshot.response.status, snapshot.response.headers).end(JSON.stringify(snapshot.response.body))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    origin,
    calls,
    answers,
    /** The calls to `path`. */
    callsTo: (path: string) => calls.filter((call) => call.path === path),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
