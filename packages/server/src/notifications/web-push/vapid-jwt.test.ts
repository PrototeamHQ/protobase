import { describe, expect, it } from 'vitest'
import { generateVapidKeys } from './keys'
import { vapidAuthorizer } from './vapid-jwt'
import { readVapidSettings, type VapidSettings } from './vapid-settings'

const settingsOf = (keys = generateVapidKeys()) => readVapidSettings({ PROTOBASE_VAPID_PUBLIC_KEY: keys.publicKey, PROTOBASE_VAPID_PRIVATE_KEY: keys.privateKey, PROTOBASE_VAPID_SUBJECT: 'mailto:admin@example.com' })!

const parts = (header: string) => {
  const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!
  const [head, claims, signature] = token!.split('.')
  return { token: token!, key: key!, head: JSON.parse(Buffer.from(head!, 'base64url').toString()), claims: JSON.parse(Buffer.from(claims!, 'base64url').toString()), input: `${head}.${claims}`, signature: Buffer.from(signature!, 'base64url') }
}

// Verified with WebCrypto, which takes the raw r‖s signature JWS uses, not the signer's own library.
const verifies = async (settings: VapidSettings, header: string) => {
  const { input, signature } = parts(header)
  const key = await crypto.subtle.importKey('raw', Buffer.from(settings.publicKey, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, new TextEncoder().encode(input))
}

describe('vapidAuthorizer', () => {
  it('signs an ES256 token for each push service origin, valid for at most 24 hours, with the configured key', async () => {
    const settings = settingsOf()
    let now = 1_800_000_000_000
    const authorize = vapidAuthorizer(settings, () => now)
    for (const audience of ['https://fcm.googleapis.com', 'https://updates.push.services.mozilla.com']) {
      const header = authorize(audience)
      const { head, claims, key } = parts(header)
      expect(head).toEqual({ typ: 'JWT', alg: 'ES256' })
      expect(claims.aud).toBe(audience)
      expect(claims.sub).toBe('mailto:admin@example.com')
      expect(claims.exp).toBeGreaterThan(now / 1000)
      expect(claims.exp).toBeLessThanOrEqual(now / 1000 + 24 * 60 * 60)
      expect(key).toBe(settings.publicKey)
      expect(await verifies(settings, header)).toBe(true)
    }
    now += 1000
    expect(authorize('https://fcm.googleapis.com')).toBe(authorize('https://fcm.googleapis.com'))
  })

  it('signs a new token once the clock passes the old one\'s expiry', () => {
    let now = 1_800_000_000_000
    const authorize = vapidAuthorizer(settingsOf(), () => now)
    const first = parts(authorize('https://fcm.googleapis.com'))
    now = (first.claims.exp + 1) * 1000
    const second = parts(authorize('https://fcm.googleapis.com'))
    expect(second.token).not.toBe(first.token)
    expect(second.claims.exp).toBeGreaterThan(now / 1000)
  })

  it('keeps each sender\'s tokens its own', async () => {
    const one = settingsOf()
    const two = settingsOf()
    const audience = 'https://fcm.googleapis.com'
    const fromOne = vapidAuthorizer(one)(audience)
    const fromTwo = vapidAuthorizer(two)(audience)
    expect(parts(fromOne).key).toBe(one.publicKey)
    expect(parts(fromTwo).key).toBe(two.publicKey)
    expect(await verifies(one, fromOne)).toBe(true)
    expect(await verifies(two, fromTwo)).toBe(true)
    expect(await verifies(one, fromTwo)).toBe(false)
  })

  it('keeps at most 16 origins, signing again for one it dropped', () => {
    const authorize = vapidAuthorizer(settingsOf(), () => 1_800_000_000_000)
    const first = authorize('https://a0.notify.windows.com')
    for (let i = 1; i <= 16; i++) authorize(`https://a${i}.notify.windows.com`)
    // ECDSA signatures are randomized, so a token signed again differs from the dropped one.
    expect(authorize('https://a0.notify.windows.com')).not.toBe(first)
  })
})
