import { gmailApiUrl } from '../../packages/workflow-plugins/src/gmail/plugin'
import { metadataHeaders } from '../../packages/workflow-plugins/src/gmail/calls'
import { mail } from '../../test-support/fake-gmail/mail'
import { onlyTestMail, scrubGmail, scrubLabels, scrubProfile, scrubTokens } from './scrub'

export const tokenUrl = 'https://oauth2.googleapis.com/token'
export const revokeUrl = 'https://oauth2.googleapis.com/revoke'

/** The token the refused refresh and revoke are recorded with: made up, never derived from a real one. */
export const invalidToken = 'invalid-recording-token'

/** The test account's OAuth client and the refresh token of its one consent. */
export type GoogleCredentials = { clientId: string; clientSecret: string; refreshToken: string }

/** A Gmail answer as recorded, by its call: the request below `users/me/`, and the answer. */
export type GmailRecording = {
  recorded_at: string
  request: { method: string; path: string; query: [string, string][] }
  response: { status: number; headers: Record<string, string>; body: unknown }
  /** The headers of the mail Gmail added, left out of the recording. */
  dropped_headers?: string[]
}

/** A token or revoke answer as recorded, in the format of the server's provider snapshots. */
export type TokenRecording = {
  stand_in: false
  recorded_at: string
  request: { method: string; url: string; form: string[] }
  response: { status: number; headers: Record<string, string>; body: Record<string, unknown> }
}

export type Recordings = { gmail: Record<string, GmailRecording>; google: Record<string, TokenRecording>; secrets: string[] }

// Only its content type is kept of an answer's headers.
const headersOf = (answer: Response) => ({ 'content-type': answer.headers.get('content-type') ?? '' })

// An answer's JSON; an error names the call and the status alone, never the answer.
const bodyOf = async (answer: Response, call: string) => {
  const text = await answer.text()
  if (!(answer.headers.get('content-type') ?? '').includes('json')) throw new Error(`${call} answered ${answer.status} without JSON`)
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch (error) {
    // The parser's message quotes the answer.
    if (error instanceof SyntaxError) throw new Error(`${call} answered ${answer.status} with broken JSON`)
    throw error
  }
}

const required = (answer: Response, call: string) => {
  if (!answer.ok) throw new Error(`${call} answered ${answer.status}`)
}

/**
 * Records Google's answers for the Gmail fake and the server's Google snapshots, with `fetch` given: one refresh of the
 * real token, kept in memory only; a refresh and a revoke with `invalidToken`; then the Gmail calls the trigger makes,
 * around one test mail this inserts, on placeholder addresses. It never revokes the real token, so it stays valid for
 * the next recording. Nothing it returns is scrubbed of the secrets yet: `writeRecordings` refuses any that leaks.
 */
export const recordGoogle = async (fetch: typeof globalThis.fetch, credentials: GoogleCredentials, now = () => new Date()): Promise<Recordings> => {
  const { clientId, clientSecret, refreshToken } = credentials
  for (const secret of Object.values(credentials)) if (secret.includes(invalidToken) || invalidToken.includes(secret)) throw new Error('The invalid token overlaps a secret value')
  const recordedAt = now().toISOString()
  const google: Record<string, TokenRecording> = {}

  const form = (fields: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })
  const token = async (name: string, url: string, fields: Record<string, string>, placeholders: Parameters<typeof scrubTokens>[1] = {}) => {
    const answer = await fetch(url, form(fields))
    const body = await bodyOf(answer, name)
    google[name] = { stand_in: false, recorded_at: recordedAt, request: { method: 'POST', url, form: Object.keys(fields) }, response: { status: answer.status, headers: headersOf(answer), body: scrubTokens(body, placeholders) } }
    return { answer, body }
  }

  const refreshed = await token('token-refresh', tokenUrl, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }, { access_token: 'snapshot-access_token-2', refresh_token: 'snapshot-refresh_token-3', id_token: 'snapshot-id_token-1' })
  required(refreshed.answer, 'The token refresh')
  const accessToken = refreshed.body.access_token
  if (typeof accessToken !== 'string' || accessToken.length === 0) throw new Error('The token refresh gave no access token')
  await token('token-refresh-invalid-grant', tokenUrl, { grant_type: 'refresh_token', refresh_token: invalidToken, client_id: clientId, client_secret: clientSecret })
  await token('revoke-error', revokeUrl, { token: invalidToken, token_type_hint: 'refresh_token', client_id: clientId, client_secret: clientSecret })

  const gmail: Record<string, GmailRecording> = {}
  const call = (path: string, query: [string, string][] = [], init: { method?: string; body?: object; bearer?: string } = {}) => {
    const params = new URLSearchParams(query)
    const url = `${gmailApiUrl}/gmail/v1/users/me/${path}${params.size > 0 ? `?${params}` : ''}`
    const headers = { authorization: `Bearer ${init.bearer ?? accessToken}`, accept: 'application/json', ...(init.body && { 'content-type': 'application/json' }) }
    return fetch(url, { method: init.method ?? 'GET', headers, ...(init.body && { body: JSON.stringify(init.body) }) })
  }
  const keep = (name: string, path: string, query: [string, string][], answer: Response, body: unknown, dropped: string[] = []) =>
    void (gmail[name] = { recorded_at: recordedAt, request: { method: 'GET', path, query }, response: { status: answer.status, headers: headersOf(answer), body }, ...(dropped.length > 0 && { dropped_headers: dropped }) })

  // The mailbox's address, which every answer has replaced, and where its history stands before the test mail.
  const before = await call('profile')
  required(before, 'getProfile')
  const { emailAddress: mailbox, historyId: start } = (await bodyOf(before, 'getProfile')) as { emailAddress: string; historyId: string }
  const since = Math.floor(now().getTime() / 1000) - 1

  const raw = mail({
    from: 'Ada <ada@example.com>',
    to: `Mailbox <mailbox@example.com>`,
    subject: 'Invoice 7',
    date: now().toUTCString(),
    messageId: `<recording-${now().getTime()}@example.com>`,
    text: 'The invoice is attached.',
    html: '<p>The invoice is attached.</p>',
    attachments: [{ filename: 'invoice-7.txt', type: 'text/plain', content: 'Invoice 7' }],
  })
  const inserted = await call('messages', [], { method: 'POST', body: { raw: Buffer.from(raw).toString('base64url'), labelIds: ['INBOX', 'UNREAD'] } })
  required(inserted, 'messages.insert')
  const testMail = (await bodyOf(inserted, 'messages.insert')) as { id: string; threadId: string }

  const get = async (name: string, path: string, query: [string, string][] = [], init: { bearer?: string } = {}) => {
    const answer = await call(path, query, init)
    return { answer, body: await bodyOf(answer, name) }
  }

  const profile = await get('getProfile', 'profile')
  keep('profile', 'profile', [], profile.answer, scrubProfile(profile.body))

  const labels = await get('labels.list', 'labels')
  keep('labels', 'labels', [], labels.answer, scrubLabels(labels.body))

  const historyQuery: [string, string][] = [['startHistoryId', start], ['historyTypes', 'messageAdded'], ['labelId', 'INBOX'], ['maxResults', '100']]
  const history = await get('history.list', 'history', historyQuery)
  required(history.answer, 'history.list')
  onlyTestMail('history.list', history.body, testMail)
  if (!JSON.stringify(history.body).includes(testMail.id)) throw new Error('history.list does not list the test mail yet: run the recording again')
  keep('history', 'history', historyQuery, history.answer, scrubGmail(history.body, mailbox).body)

  const listQuery: [string, string][] = [['labelIds', 'INBOX'], ['q', `after:${since}`], ['maxResults', '100']]
  const listed = await get('messages.list', 'messages', listQuery)
  required(listed.answer, 'messages.list')
  onlyTestMail('messages.list', listed.body, testMail)
  keep('messages', 'messages', listQuery, listed.answer, scrubGmail(listed.body, mailbox).body)

  for (const [name, query] of [
    ['message-raw', [['format', 'raw']]],
    ['message-metadata', [['format', 'metadata'], ...metadataHeaders.map((header) => ['metadataHeaders', header])]],
  ] as [string, [string, string][]][]) {
    const message = await get('messages.get', `messages/${testMail.id}`, query)
    required(message.answer, 'messages.get')
    onlyTestMail('messages.get', message.body, testMail)
    const { body, dropped } = scrubGmail(message.body, mailbox)
    keep(name, `messages/${testMail.id}`, query, message.answer, body, dropped)
  }

  // Google's answers to a message it has not, to a token it refuses and to a history id it no longer keeps.
  const unknown = await get('messages.get', 'messages/0000000000000000', [['format', 'raw']])
  keep('message-not-found', 'messages/0000000000000000', [['format', 'raw']], unknown.answer, scrubGmail(unknown.body, mailbox).body)
  const refused = await get('getProfile', 'profile', [], { bearer: invalidToken })
  keep('unauthenticated', 'profile', [], refused.answer, scrubGmail(refused.body, mailbox).body)
  const expiredQuery: [string, string][] = [['startHistoryId', '1'], ['historyTypes', 'messageAdded'], ['labelId', 'INBOX'], ['maxResults', '100']]
  // A mailbox that still keeps its history from the start answers with its mail, which is never recorded.
  const expired = await call('history', expiredQuery)
  if (!expired.ok) keep('history-expired', 'history', expiredQuery, expired, scrubGmail(await bodyOf(expired, 'history.list'), mailbox).body)
  else await expired.body?.cancel()

  return { gmail, google, secrets: [clientId, clientSecret, refreshToken, accessToken, mailbox] }
}
