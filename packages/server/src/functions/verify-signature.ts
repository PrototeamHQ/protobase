import { HttpProblem } from '../problem'

export type SignatureOptions = {
  /** The shared secret, as the sender shows it. */
  secret: string
  /** The header that carries the signature, such as `x-hub-signature-256`. */
  header: string
  /** Text before the signature in that header, such as `sha256=`. */
  prefix?: string
  /** How the signature is written. Default `hex`. */
  encoding?: 'hex' | 'base64'
  /** Default `SHA-256`. */
  hash?: 'SHA-1' | 'SHA-256' | 'SHA-512'
}

const invalid = (detail: string) => new HttpProblem(401, 'invalid-signature', 'Unauthorized', detail)

const decodeHex = (text: string) => (/^(?:[0-9a-f]{2})+$/i.test(text) ? new Uint8Array(text.match(/../g)!.map((pair) => parseInt(pair, 16))) : undefined)

const decodeBase64 = (text: string) =>
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text) && text.length > 0 ? Uint8Array.from(atob(text), (char) => char.charCodeAt(0)) : undefined

// Web Crypto's HMAC verify compares in constant time.
const verifyHmac = async (key: Uint8Array<ArrayBuffer>, hash: string, signature: Uint8Array<ArrayBuffer>, content: string) => {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash }, false, ['verify'])
  return crypto.subtle.verify('HMAC', cryptoKey, signature, new TextEncoder().encode(content))
}

/**
 * The request's body as text, once its HMAC signature checks out against `secret`, as GitHub, Shopify and many others
 * sign their webhooks. A missing or wrong signature is a 401 `invalid-signature` problem.
 */
export const verifySignature = async (request: Request, { secret, header, prefix = '', encoding = 'hex', hash = 'SHA-256' }: SignatureOptions) => {
  const body = await request.text()
  const value = request.headers.get(header)
  if (!value?.startsWith(prefix)) throw invalid(`The request has no ${header} signature`)
  const text = value.slice(prefix.length).trim()
  const signature = encoding === 'hex' ? decodeHex(text) : decodeBase64(text)
  if (!signature || !(await verifyHmac(new TextEncoder().encode(secret), hash, signature, body))) throw invalid(`The ${header} signature does not match the body`)
  return body
}

export type StandardWebhookOptions = {
  /** The endpoint's secret, `whsec_` and base64. */
  secret: string
  /** How old, or how far ahead, a message may be. Default 300. */
  toleranceSeconds?: number
  /** The current time in milliseconds; for tests. */
  now?: () => number
}

/**
 * The request's body as text, once its Standard Webhooks signature checks out (https://www.standardwebhooks.com), as
 * Supabase Auth hooks, Svix, Resend and others sign theirs. A missing, stale or wrong signature is a 401 problem.
 */
export const verifyStandardWebhook = async (request: Request, { secret, toleranceSeconds = 300, now = Date.now }: StandardWebhookOptions) => {
  const body = await request.text()
  const id = request.headers.get('webhook-id')
  const timestamp = request.headers.get('webhook-timestamp')
  const signatures = request.headers.get('webhook-signature')
  if (!id || !timestamp || !signatures) throw invalid('The request has no webhook-id, webhook-timestamp and webhook-signature headers')
  const seconds = Number(timestamp)
  if (!Number.isInteger(seconds) || Math.abs(now() / 1000 - seconds) > toleranceSeconds) throw invalid('The webhook-timestamp is too old or too far ahead')
  const key = decodeBase64(secret.replace(/^whsec_/, ''))
  if (!key) throw new Error('The Standard Webhooks secret is not base64 (whsec_...)')
  const content = `${id}.${timestamp}.${body}`
  for (const entry of signatures.split(' ')) {
    const [version, text = ''] = entry.split(',')
    const signature = decodeBase64(text)
    if (version === 'v1' && signature && (await verifyHmac(key, 'SHA-256', signature, content))) return body
  }
  throw invalid('No webhook-signature matches the body')
}
