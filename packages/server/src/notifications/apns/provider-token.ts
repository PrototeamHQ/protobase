import { sign } from 'node:crypto'
import type { ApnsSettings } from './apns-settings'

/** A token is signed again once it is this old: APNs refuses one older than an hour, or renewed within 20 minutes. */
const renewSeconds = 50 * 60

const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

const signed = (settings: ApnsSettings, iat: number) => {
  const input = `${encoded({ alg: 'ES256', kid: settings.keyId })}.${encoded({ iss: settings.teamId, iat })}`
  const signature = sign('sha256', Buffer.from(input), { key: settings.key, dsaEncoding: 'ieee-p1363' })
  return `${input}.${signature.toString('base64url')}`
}

/**
 * The APNs provider token (an ES256 JWT with the key id and team id), kept as one entry and signed again once it is 50
 * minutes old. `reset` drops it, for when APNs answers that it expired.
 */
export const providerToken = (settings: ApnsSettings, now: () => number = Date.now) => {
  let kept: { token: string; iat: number } | undefined

  const token = () => {
    const seconds = Math.floor(now() / 1000)
    if (!kept || seconds - kept.iat >= renewSeconds) kept = { token: signed(settings, seconds), iat: seconds }
    return kept.token
  }

  const reset = () => {
    kept = undefined
  }

  return { token, reset }
}
