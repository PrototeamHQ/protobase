import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { invalidToken, recordGoogle, revokeUrl, tokenUrl, type GoogleCredentials } from './google-calls'
import { credentialsFrom } from './record'
import { writeRecordings } from './write'

// Made-up credentials in the shapes of real ones.
const credentials: GoogleCredentials = { clientId: '1234-made-up.apps.googleusercontent.com', clientSecret: 'GOCSPX-made-up-secret', refreshToken: '1//0g-made-up-refresh' }
const accessToken = 'ya29.made-up-access'
const mailbox = 'someone.real@mailbox.test'

type Sent = { url: string; method: string; headers: Headers; body: string }
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8' } })

// Google with one test account: its token and revoke endpoints and the Gmail calls the recording makes. `fail` answers
// the first request to a URL starting with it with that status, echoing the request back as Google's errors may.
const google = ({ fail }: { fail?: { url: string; status: number } } = {}) => {
  const sent: Sent[] = []
  let inserted: { id: string; threadId: string } | undefined
  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    const request = { url, method: init.method ?? 'GET', headers: new Headers(init.headers), body: String(init.body ?? '') }
    sent.push(request)
    if (fail && url.startsWith(fail.url)) return json({ error: 'echo', request: request.body, authorization: request.headers.get('authorization') }, fail.status)
    if (url === tokenUrl) return new URLSearchParams(request.body).get('refresh_token') === credentials.refreshToken ? json({ access_token: accessToken, expires_in: 3599, token_type: 'Bearer' }) : json({ error: 'invalid_grant', error_description: 'Bad Request' }, 400)
    if (url === revokeUrl) return json({ error: 'invalid_token' }, 400)
    if (request.headers.get('authorization') !== `Bearer ${accessToken}`) return json({ error: { code: 401, status: 'UNAUTHENTICATED' } }, 401)
    const path = new URL(url).pathname.replace('/gmail/v1/users/me/', '')
    if (path === 'profile') return json({ emailAddress: mailbox, messagesTotal: 812, threadsTotal: 640, historyId: '10' })
    if (path === 'messages' && request.method === 'POST') return json((inserted = { id: 'aaa', threadId: 'aaa' }))
    if (path === 'labels') return json({ labels: [{ id: 'INBOX', name: 'INBOX', type: 'system' }, { id: 'Label_1', name: 'Private', type: 'user' }] })
    if (path === 'history') return new URL(url).searchParams.get('startHistoryId') === '1' ? json({ error: { code: 404 } }, 404) : json({ history: [{ id: '11', messages: [inserted] }], historyId: '11' })
    if (path === 'messages') return json({ messages: [inserted], resultSizeEstimate: 1 })
    if (path === 'messages/aaa') {
      const raw = Buffer.from(`Received: by mx for <${mailbox}>\r\nFrom: Ada <ada@example.com>\r\nTo: <mailbox@example.com>\r\n\r\nhi`).toString('base64url')
      return json({ ...inserted, ...(new URL(url).searchParams.get('format') === 'raw' ? { raw } : { payload: { headers: [{ name: 'Delivered-To', value: mailbox }] } }) })
    }
    return json({ error: { code: 404 } }, 404)
  }) as typeof globalThis.fetch
  return { fetch, sent }
}

const secretValues = [...Object.values(credentials), accessToken]
const failure = (work: Promise<unknown>) => work.then(() => undefined, (error: unknown) => error as Error)

describe('recordGoogle', () => {
  const dirs: string[] = []
  const tmp = () => {
    const dir = mkdtempSync(join(tmpdir(), 'google-recording-'))
    dirs.push(dir)
    return { gmail: join(dir, 'gmail'), google: join(dir, 'google') }
  }
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  it('revokes only the made-up invalid token, never the real refresh token, and refreshes that only once', async () => {
    const { fetch, sent } = google()
    await recordGoogle(fetch, credentials)
    const revokes = sent.filter(({ url }) => url === revokeUrl)
    expect(revokes.map(({ body }) => new URLSearchParams(body).get('token'))).toEqual([invalidToken])
    const carrying = sent.filter(({ body }) => decodeURIComponent(body).includes(credentials.refreshToken))
    expect(carrying.map(({ url }) => url)).toEqual([tokenUrl])
  })

  it('inserts its test mail on placeholder addresses', async () => {
    const { fetch, sent } = google()
    await recordGoogle(fetch, credentials)
    const insert = sent.find(({ method, url }) => method === 'POST' && url.endsWith('/messages'))!
    const mail = Buffer.from((JSON.parse(insert.body) as { raw: string }).raw, 'base64url').toString()
    expect(mail).toMatch(/^From: Ada <ada@example\.com>$/m)
    expect(mail).toMatch(/^To: Mailbox <mailbox@example\.com>$/m)
    expect(mail).not.toContain('mailbox.test')
  })

  it('writes recordings that hold no secret value, no real address and no user label, with only the content type of each answer', async () => {
    const { fetch } = google()
    const recorded = await recordGoogle(fetch, credentials)
    const dirs = tmp()
    writeRecordings(recorded, dirs)
    expect(readdirSync(dirs.google).sort()).toEqual(['revoke-error.json', 'token-refresh-invalid-grant.json', 'token-refresh.json'])
    const all = JSON.stringify(recorded.gmail) + JSON.stringify(recorded.google)
    for (const value of [...secretValues, mailbox, 'Private']) expect(all).not.toContain(value)
    expect(recorded.google['token-refresh']!.response.body.access_token).toBe('snapshot-access_token-2')
    expect(recorded.gmail['message-raw']!.dropped_headers).toEqual(['Received'])
    expect(Object.values(recorded.gmail).every(({ response }) => Object.keys(response.headers).join() === 'content-type')).toBe(true)
  })

  it('refuses to start when the made-up invalid token overlaps a secret value', async () => {
    const { fetch, sent } = google()
    expect((await failure(recordGoogle(fetch, { ...credentials, refreshToken: `${invalidToken}-and-more` })))?.message).toBe('The invalid token overlaps a secret value')
    expect(sent).toEqual([])
  })

  it('fails naming the call and status alone when Google refuses, though its answer echoes the secrets back', async () => {
    for (const url of [tokenUrl, 'https://gmail.googleapis.com/gmail/v1/users/me/history']) {
      const error = await failure(recordGoogle(google({ fail: { url, status: 400 } }).fetch, credentials))
      expect(error).toBeInstanceOf(Error)
      const said = `${error!.message} ${error!.stack} ${JSON.stringify(error)} ${String(error!.cause)}`
      for (const value of secretValues) expect(said).not.toContain(value)
    }
  })

  it('fails when Google answers a recorded error call with another status, so no success is kept as an error', async () => {
    const { fetch } = google()
    const unknown = (async (input, init) => (String(input).includes('messages/0000000000000000') ? json({ id: '0000000000000000' }) : fetch(input, init))) as typeof globalThis.fetch
    expect((await failure(recordGoogle(unknown, credentials)))?.message).toBe('messages.get of an unknown message answered 200, not 404')
    const accepted = (async (input, init) => (new Headers(init?.headers).get('authorization') === `Bearer ${invalidToken}` ? json({ emailAddress: 'mailbox@example.com' }) : fetch(input, init))) as typeof globalThis.fetch
    expect((await failure(recordGoogle(accepted, credentials)))?.message).toBe('getProfile with the invalid token answered 200, not 401')
  })

  it('writes nothing when one recording would leak, naming the kind of leak and not the value', () => {
    const dirs = tmp()
    const recorded = { gmail: { profile: { recorded_at: 'now', request: { method: 'GET', path: 'profile', query: [] }, response: { status: 200, headers: {}, body: { note: 'made-up-secret-value' } } } }, google: {}, secrets: ['made-up-secret-value'] }
    const error = (() => {
      try {
        writeRecordings(recorded, dirs)
      } catch (thrown) {
        return thrown as Error
      }
    })()
    expect(error?.message).toMatch(/would keep a secret value$/)
    expect(error?.message).not.toContain('made-up-secret-value')
    expect(existsSync(dirs.gmail)).toBe(false)
  })
})

describe('credentialsFrom', () => {
  it('names the variables that are missing, and no value', () => {
    expect(() => credentialsFrom({ TEST_GOOGLE_CLIENT_SECRET: 'made-up-secret-value' })).toThrow('Set TEST_GOOGLE_CLIENT_ID_SECRET, TEST_GOOGLE_REFRESH_TOKEN to record')
    expect(credentialsFrom({ TEST_GOOGLE_CLIENT_ID_SECRET: 'a', TEST_GOOGLE_CLIENT_SECRET: 'b', TEST_GOOGLE_REFRESH_TOKEN: 'c' })).toEqual({ clientId: 'a', clientSecret: 'b', refreshToken: 'c' })
  })
})
