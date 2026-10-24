import { createPrivateKey, type KeyObject } from 'node:crypto'
import { fromBase64url, isPublicPoint, publicKeyOf } from './keys'

/**
 * The VAPID key pair and contact (RFC 8292) the Web Push sender signs with. The private key is a `KeyObject`, which
 * prints no key material when logged or serialized.
 */
export type VapidSettings = { publicKey: string; privateKey: KeyObject; subject: string }

export const vapidPublicKeyVariable = 'PROTOBASE_VAPID_PUBLIC_KEY'
export const vapidPrivateKeyVariable = 'PROTOBASE_VAPID_PRIVATE_KEY'
export const vapidSubjectVariable = 'PROTOBASE_VAPID_SUBJECT'
const variables = [vapidPublicKeyVariable, vapidPrivateKeyVariable, vapidSubjectVariable]

// RFC 8292: a mailto: address or an https: URL the push service can reach the sender at.
const isSubject = (subject: string) => {
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(subject)) return true
  return URL.canParse(subject) && new URL(subject).protocol === 'https:' && !/\s/.test(subject)
}

/**
 * The VAPID settings from `PROTOBASE_VAPID_PUBLIC_KEY`, `PROTOBASE_VAPID_PRIVATE_KEY` and `PROTOBASE_VAPID_SUBJECT`;
 * `undefined` when none is set, which turns Web Push off. A blank variable counts as unset. Some set but not all, a key
 * that is not one, a public key that is not the private key's, or a subject that is no `mailto:` or `https:` URL is a
 * configuration error naming the variable, never its value, so the server stops at startup.
 */
export const readVapidSettings = (env: Record<string, string | undefined>): VapidSettings | undefined => {
  const [publicText, privateText, subject] = variables.map((name) => env[name]?.trim() || undefined)
  if (!publicText && !privateText && !subject) return undefined
  const missing = variables.filter((name) => !env[name]?.trim())
  if (missing.length > 0) throw new Error(`${missing.join(' and ')} must be set for Web Push, with ${variables.filter((name) => !missing.includes(name)).join(' and ')}; set all three, or none to turn Web Push off`)

  const publicKey = fromBase64url(publicText)
  if (!isPublicPoint(publicKey)) throw new Error(`${vapidPublicKeyVariable} is not a P-256 public key in base64url; generate a pair with protobase notifications vapid-keys`)
  const privateKey = fromBase64url(privateText)
  const derived = privateKey && publicKeyOf(privateKey)
  if (!derived) throw new Error(`${vapidPrivateKeyVariable} is not a P-256 private key in base64url; generate a pair with protobase notifications vapid-keys`)
  if (!derived.equals(publicKey)) throw new Error(`${vapidPublicKeyVariable} is not the public key of ${vapidPrivateKeyVariable}; set both from one pair`)
  if (!isSubject(subject!)) throw new Error(`${vapidSubjectVariable} must be a mailto: address or an https: URL, such as mailto:admin@example.com`)

  const jwk = { kty: 'EC', crv: 'P-256', d: privateKey!.toString('base64url'), x: publicKey.subarray(1, 33).toString('base64url'), y: publicKey.subarray(33).toString('base64url') }
  return { publicKey: publicKey.toString('base64url'), privateKey: createPrivateKey({ key: jwk, format: 'jwk' }), subject: subject! }
}
