import { isTransient } from './fcm-post'
import { rs256, type FcmSettings } from './fcm-settings'

/** Google's OAuth 2.0 token endpoint, fixed: the assertion is never sent where a service account's JSON says. */
export const tokenUrl = 'https://oauth2.googleapis.com/token'
/** The one scope the token carries: sending through FCM. */
export const fcmScope = 'https://www.googleapis.com/auth/firebase.messaging'
/** How long an assertion is valid: the most Google accepts. */
const assertionSeconds = 3600
/** A token is minted again once less than this is left of it, so none expires on its way through a batch. */
export const refreshSeconds = 5 * 60
const defaultTimeoutMs = 10_000

export type AccessTokenOptions = { fetch?: typeof fetch; now?: () => number; timeoutMs?: number }

const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** The signed JWT a service account trades for an access token (RFC 7523), valid for an hour. */
export const assertionOf = async (settings: FcmSettings, seconds: number) => {
  const claims = { iss: settings.clientEmail, scope: fcmScope, aud: tokenUrl, iat: seconds, exp: seconds + assertionSeconds }
  const input = `${encoded({ alg: 'RS256', typ: 'JWT' })}.${encoded(claims)}`
  const signature = await crypto.subtle.sign(rs256, settings.privateKey, Buffer.from(input))
  return `${input}.${Buffer.from(signature).toString('base64url')}`
}

/** A mint that got no access token: the token endpoint refused, gave no bearer token, or did not answer. */
export class FcmTokenError extends Error {}

const failed = (status: number) => new FcmTokenError(`The FCM token exchange failed with status ${status}`)

// The token endpoint's answer, status and body; a request that gets none, such as a timeout or a body cut off while
// it is read, is a failed mint like a refusal.
const exchange = async (send: typeof fetch, request: Request, timeoutMs: number) => {
  try {
    const response = await send(request, { signal: AbortSignal.timeout(timeoutMs) })
    return { status: response.status, text: await response.text() }
  } catch (error) {
    if (isTransient(error)) throw new FcmTokenError('The FCM token exchange did not answer')
    throw error
  }
}

// The token and its lifetime from the token endpoint's answer; anything but a bearer token is a failure that names
// the status alone, since the answer may hold a token.
const tokenOf = ({ status, text }: { status: number; text: string }) => {
  if (status !== 200) throw failed(status)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) throw failed(status)
    throw error
  }
  const { access_token, token_type, expires_in } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  if (typeof access_token !== 'string' || access_token.length === 0 || /[\s\u0000-\u001f]/.test(access_token)) throw failed(status)
  // RFC 6749 section 7.1: the token type is case-insensitive.
  if (typeof token_type !== 'string' || token_type.toLowerCase() !== 'bearer') throw failed(status)
  if (!Number.isInteger(expires_in) || (expires_in as number) <= 0) throw failed(status)
  return { token: access_token, expiresIn: expires_in as number }
}

type Entry = { promise: Promise<string>; expiresAt: number; token?: string }

/**
 * The access token FCM requests carry, minted from the service account and kept in one entry until less than five
 * minutes are left of it. Calls while a token is minted share that one request. A mint that fails is dropped, so the
 * next call mints again; `invalidate` drops the token FCM refused, unless a newer one already replaced it. A failed
 * mint is an `FcmTokenError` naming the token endpoint's status alone, never the assertion, the token or the answer.
 */
export const fcmAccessToken = (settings: FcmSettings, options: AccessTokenOptions = {}) => {
  const now = options.now ?? Date.now
  const send = options.fetch ?? fetch
  let entry: Entry | undefined

  const mint = async (seconds: number, kept: Entry) => {
    const assertion = await assertionOf(settings, seconds)
    const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
    const request = new Request(tokenUrl, { method: 'POST', body: form, redirect: 'manual' })
    const { token, expiresIn } = tokenOf(await exchange(send, request, options.timeoutMs ?? defaultTimeoutMs))
    kept.expiresAt = seconds + expiresIn
    kept.token = token
    return token
  }

  const token = () => {
    const seconds = Math.floor(now() / 1000)
    if (entry && entry.expiresAt - seconds > refreshSeconds) return entry.promise
    // Until the answer comes, the entry counts as fresh, so the calls meanwhile share it.
    const kept: Entry = { promise: Promise.resolve(''), expiresAt: Number.POSITIVE_INFINITY }
    kept.promise = mint(seconds, kept)
    entry = kept
    kept.promise.catch(() => {
      if (entry === kept) entry = undefined
    })
    return kept.promise
  }

  const invalidate = (refused: string) => {
    if (entry?.token === refused) entry = undefined
  }

  return { token, invalidate }
}
