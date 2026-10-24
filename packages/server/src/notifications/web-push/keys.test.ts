import { describe, expect, it } from 'vitest'
import { fromBase64url, generateVapidKeys, isPublicKey, padPrivateKey, publicKeyOf } from './keys'
import { readVapidSettings } from './vapid-settings'

const env = (keys: { publicKey: string; privateKey: string }) => ({ PROTOBASE_VAPID_PUBLIC_KEY: keys.publicKey, PROTOBASE_VAPID_PRIVATE_KEY: keys.privateKey, PROTOBASE_VAPID_SUBJECT: 'mailto:admin@example.com' })

describe('generateVapidKeys', () => {
  it('makes a different pair each time, each passing the startup checks', () => {
    const first = generateVapidKeys()
    const second = generateVapidKeys()
    expect(first.publicKey).not.toBe(second.publicKey)
    expect(first.privateKey).not.toBe(second.privateKey)
    expect(readVapidSettings(env(first))?.publicKey).toBe(first.publicKey)
    expect(readVapidSettings(env(second))?.publicKey).toBe(second.publicKey)
  })

  it('writes every private key as 32 bytes', () => {
    for (let i = 0; i < 300; i++) expect(fromBase64url(generateVapidKeys().privateKey)?.length).toBe(32)
  })
})

describe('padPrivateKey', () => {
  it('keeps a scalar with a leading zero byte usable', () => {
    const scalar = Buffer.alloc(32, 0x11)
    scalar[0] = 0
    const padded = padPrivateKey(scalar.subarray(1))
    expect(padded.equals(scalar)).toBe(true)
    const publicKey = publicKeyOf(padded)!.toString('base64url')
    expect(readVapidSettings(env({ publicKey, privateKey: padded.toString('base64url') }))?.publicKey).toBe(publicKey)
  })
})

describe('isPublicKey', () => {
  it('accepts a P-256 point and refuses anything else', () => {
    expect(isPublicKey(generateVapidKeys().publicKey)).toBe(true)
    expect(isPublicKey(generateVapidKeys().privateKey)).toBe(false)
    const offCurve = Buffer.alloc(65, 1)
    offCurve[0] = 4
    expect(isPublicKey(offCurve.toString('base64url'))).toBe(false)
    expect(isPublicKey('not base64url!')).toBe(false)
    expect(isPublicKey(undefined)).toBe(false)
  })
})
