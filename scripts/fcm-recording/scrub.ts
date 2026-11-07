import { clientEmailPlaceholder, projectPlaceholder, type FcmRecording } from '../../packages/server/src/notifications/fcm/testing/recordings'
import { findLeak } from '../google-recording/scrub'

// The placeholders each credential gets, by where it sits in a recording.
const assertionPlaceholder = 'snapshot-assertion-1'
const accessTokenPlaceholder = 'snapshot-access_token-1'
const invalidBearerPlaceholder = 'snapshot-access_token-2'

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const replaced = (value: unknown, from: string, to: string): unknown => {
  if (typeof value === 'string') return value.replace(new RegExp(escaped(from), 'g'), to)
  if (Array.isArray(value)) return value.map((item) => replaced(item, from, to))
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaced(item, from, to)]))
  return value
}

/**
 * `recording` as committed: the assertion, the access token and the bearer replaced by placeholders, and the real
 * project and service account address by theirs wherever they appear, an error message's text included.
 */
export const scrubRecording = (recording: FcmRecording, real: { projectId: string; clientEmail: string }): FcmRecording => {
  const { request, response } = recording
  const body = response.body as Record<string, unknown>
  const scrubbed: FcmRecording = {
    ...recording,
    request: {
      ...request,
      headers: request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization.startsWith('Bearer invalid-') ? `Bearer ${invalidBearerPlaceholder}` : `Bearer ${accessTokenPlaceholder}` },
      body: request.body.assertion === undefined ? request.body : { ...request.body, assertion: assertionPlaceholder },
    },
    response: { ...response, body: typeof body?.access_token === 'string' ? { ...body, access_token: accessTokenPlaceholder } : body },
  }
  return replaced(replaced(scrubbed, real.clientEmail, clientEmailPlaceholder), real.projectId, projectPlaceholder) as FcmRecording
}

/** What `value` would leak, by kind and never by value: a secret value, a key, or a Google token or address shape. */
export const findFcmLeak = (value: unknown, secrets: string[]) => {
  const text = JSON.stringify(value)
  if (text.includes('-----BEGIN') || text.includes('PRIVATE KEY')) return 'a private key'
  return findLeak(value, secrets)
}
