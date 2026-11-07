import { generateKeyPairSync } from 'node:crypto'
import { assertionOf, tokenUrl } from '../../packages/server/src/notifications/fcm/access-token'
import { fcmOrigin } from '../../packages/server/src/notifications/fcm/fcm-sender'
import { fcmRequest } from '../../packages/server/src/notifications/fcm/fcm-request'
import { rs256, type FcmSettings } from '../../packages/server/src/notifications/fcm/fcm-settings'
import { recordedMessage, type FcmRecording } from '../../packages/server/src/notifications/fcm/testing/recordings'
import { pushMessage } from '../../packages/server/src/notifications/message'
import { fcmDevice } from '../../packages/server/src/notifications/fcm/testing/fcm-device'

/** The bearer the refused send is recorded with: made up, never derived from a real one. */
export const invalidBearer = 'invalid-recording-bearer'
/** A project id the service account has no access to. */
export const foreignProject = 'recording-no-access'

// Only its content type and retry-after are kept of an answer's headers.
const headersOf = (answer: Response) => Object.fromEntries(['content-type', 'retry-after'].flatMap((name) => (answer.headers.has(name) ? [[name, answer.headers.get(name)!]] : [])))

const bodyOf = async (answer: Response, call: string): Promise<unknown> => {
  const text = await answer.text()
  try {
    return JSON.parse(text)
  } catch (error) {
    // The parser's message quotes the answer.
    if (error instanceof SyntaxError) throw new Error(`${call} answered ${answer.status} with no JSON`)
    throw error
  }
}

const expected = (answer: Response, call: string, status: number) => {
  if (answer.status !== status) throw new Error(`${call} answered ${answer.status}, not ${status}`)
}

/** The recordings by name, unscrubbed, and the values no file may keep. */
export type Recordings = { recordings: Record<string, FcmRecording>; secrets: string[] }

/**
 * Records the token endpoint's and FCM's answers with `settings`: a token exchange, kept in memory only; one with an
 * assertion signed by a throwaway key; and sends of the recorded message to the made-up token, to it with an invalid
 * bearer, to a token that is none, and to a project the account cannot reach. Nothing it returns is scrubbed yet.
 */
export const recordFcm = async (fetch: typeof globalThis.fetch, settings: FcmSettings, now = () => new Date()): Promise<Recordings> => {
  const recordedAt = now().toISOString()
  const recordings: Record<string, FcmRecording> = {}
  const seconds = Math.floor(now().getTime() / 1000)

  const exchange = async (name: string, assertion: string, status: number) => {
    const answer = await fetch(tokenUrl, { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) })
    expected(answer, name, status)
    const body = await bodyOf(answer, name)
    recordings[name] = { stand_in: false, recorded_at: recordedAt, request: { method: 'POST', url: tokenUrl, headers: {}, body: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion } }, response: { status: answer.status, headers: headersOf(answer), body } }
    return body as { access_token?: string }
  }

  const realAssertion = await assertionOf(settings, seconds)
  const { access_token: accessToken } = await exchange('token-ok', realAssertion, 200)
  if (!accessToken) throw new Error('The token exchange answered no access token')
  const throwaway = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.toCryptoKey(rs256, false, ['sign'])
  const foreignAssertion = await assertionOf({ ...settings, privateKey: throwaway }, seconds)
  await exchange('token-invalid-grant', foreignAssertion, 400)

  const send = async (name: string, status: number, change: { bearer?: string; project?: string; token?: string } = {}) => {
    const url = new URL(`/v1/projects/${change.project ?? settings.projectId}/messages:send`, fcmOrigin).href
    const body = fcmRequest(pushMessage(recordedMessage), fcmDevice(change.token === undefined ? {} : { token: change.token }))
    const headers = { authorization: `Bearer ${change.bearer ?? accessToken}` }
    const answer = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expected(answer, name, status)
    recordings[name] = { stand_in: false, recorded_at: recordedAt, request: { method: 'POST', url, headers, body }, response: { status: answer.status, headers: headersOf(answer), body: await bodyOf(answer, name) } }
  }

  await send('send-unregistered', 404)
  await send('send-invalid-argument', 400, { token: 'not-a-registration-token' })
  await send('send-unauthenticated', 401, { bearer: invalidBearer })
  await send('send-permission-denied', 403, { project: foreignProject })
  return { recordings, secrets: [accessToken, realAssertion, foreignAssertion, settings.projectId, settings.clientEmail] }
}
