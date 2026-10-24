import { sign } from 'node:crypto'
import type { VapidSettings } from './vapid-settings'

/** How long a token is valid: RFC 8292 allows at most 24 hours. */
const lifetimeSeconds = 12 * 60 * 60
/** A token is signed again once less than this is left of it, so none expires on its way. */
const refreshSeconds = 60 * 60
/** The push services' origins a sender keeps a token for: a handful, as there are a handful of push services. */
const maxAudiences = 16

const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

const signed = (settings: VapidSettings, audience: string, exp: number) => {
  const input = `${encoded({ typ: 'JWT', alg: 'ES256' })}.${encoded({ aud: audience, exp, sub: settings.subject })}`
  const signature = sign('sha256', Buffer.from(input), { key: settings.privateKey, dsaEncoding: 'ieee-p1363' })
  return `${input}.${signature.toString('base64url')}`
}

/**
 * The `Authorization` header of a Web Push request to a push service's origin (RFC 8292): `vapid t=<ES256 JWT>,
 * k=<public key>`. A token is reused for its origin until an hour before it expires; at most 16 origins are kept, the
 * least recently used dropped first. Each sender makes its own, so no two key pairs share a token.
 */
export const vapidAuthorizer = (settings: VapidSettings, now: () => number = Date.now) => {
  const tokens = new Map<string, { token: string; exp: number }>()

  return (audience: string) => {
    const seconds = Math.floor(now() / 1000)
    const kept = tokens.get(audience)
    tokens.delete(audience)
    const entry = kept && kept.exp - seconds > refreshSeconds ? kept : { token: signed(settings, audience, seconds + lifetimeSeconds), exp: seconds + lifetimeSeconds }
    tokens.set(audience, entry)
    if (tokens.size > maxAudiences) tokens.delete(tokens.keys().next().value!)
    return `vapid t=${entry.token}, k=${settings.publicKey}`
  }
}
