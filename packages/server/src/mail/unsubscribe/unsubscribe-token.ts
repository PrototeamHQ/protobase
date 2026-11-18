import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

/** What an unsubscribe token names: the recipient, lower-cased, and the topic they unsubscribe from. */
export type UnsubscribeTarget = { recipient: string; topic: string }

/** The key that signs unsubscribe tokens, derived from the app's secret by HKDF, so no other use of the secret signs one. */
export const unsubscribeKey = (secret: string) => Buffer.from(hkdfSync('sha256', secret, new Uint8Array(0), 'protobase mail unsubscribe', 32))

const signature = (key: Buffer, payload: string) => createHmac('sha256', key).update(payload).digest()

/** A token for `target`: its recipient and topic, then an HMAC-SHA256 of them, both base64url, joined by a dot. */
export const signUnsubscribeToken = (key: Buffer, { recipient, topic }: UnsubscribeTarget) => {
  const payload = Buffer.from(JSON.stringify([recipient.toLowerCase(), topic])).toString('base64url')
  return `${payload}.${signature(key, payload).toString('base64url')}`
}

/** What `token` names, or `undefined` when it is not one `key` signed, such as a changed recipient, topic or signature. */
export const readUnsubscribeToken = (key: Buffer, token: string): UnsubscribeTarget | undefined => {
  const [payload, signed, extra] = token.split('.')
  if (!payload || !signed || extra !== undefined) return
  const expected = signature(key, payload)
  const given = Buffer.from(signed, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return
  const target: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString())
  if (!Array.isArray(target) || target.length !== 2 || typeof target[0] !== 'string' || typeof target[1] !== 'string') return
  return { recipient: target[0], topic: target[1] }
}
