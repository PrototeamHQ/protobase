import { createECDH } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { webPushReceiver } from '../testing/web-push-receiver'
import { encryptPayload, maxPlaintextBytes } from './encrypt'

const b64 = (text: string) => Buffer.from(text.replace(/\s+/g, ''), 'base64url')
const keysOf = (receiver: ReturnType<typeof webPushReceiver>) => ({ p256dh: b64(receiver.p256dh), auth: b64(receiver.auth) })

describe('encryptPayload', () => {
  it('reproduces the worked example of RFC 8291 (section 5, appendix A)', () => {
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(b64('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'))
    const body = encryptPayload(
      b64('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
      { p256dh: b64('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'), auth: b64('BTBZMqHH6r4Tts7J_aSIgg') },
      { salt: b64('DGv6ra1nlYgDCS1FRnbzlw'), ecdh },
    )
    const header = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
    const ciphertext = '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ'
    expect(body.toString('base64url')).toBe(Buffer.concat([b64(header), b64(ciphertext)]).toString('base64url'))
  })

  it('makes a body only its own subscription decrypts, with no plaintext in it', () => {
    const one = webPushReceiver()
    const two = webPushReceiver()
    const body = encryptPayload(Buffer.from('{"title":"Secret title"}'), keysOf(one))
    expect(one.decrypt(body)).toBe('{"title":"Secret title"}')
    expect(() => two.decrypt(body)).toThrow()
    expect(body.toString('latin1')).not.toContain('Secret title')
  })

  it('uses a fresh salt and ephemeral key for every body', () => {
    const one = webPushReceiver()
    const two = webPushReceiver()
    const plaintext = Buffer.from('{"title":"x"}')
    const bodies = [encryptPayload(plaintext, keysOf(one)), encryptPayload(plaintext, keysOf(one)), encryptPayload(plaintext, keysOf(one)), encryptPayload(plaintext, keysOf(two))]
    const headers = bodies.map((body) => one.header(body))
    expect(new Set(headers.map((header) => header.salt)).size).toBe(4)
    expect(new Set(headers.map((header) => header.key)).size).toBe(4)
    expect(headers.every((header) => header.salt.length === 32)).toBe(true)
    expect(one.decrypt(bodies[1]!)).toBe('{"title":"x"}')
    expect(two.decrypt(bodies[3]!)).toBe('{"title":"x"}')
  })

  it('fits the largest payload in 4096 bytes and refuses a larger one', () => {
    const receiver = webPushReceiver()
    expect(encryptPayload(Buffer.alloc(maxPlaintextBytes, 0x61), keysOf(receiver)).length).toBe(4096)
    expect(() => encryptPayload(Buffer.alloc(maxPlaintextBytes + 1), keysOf(receiver))).toThrow()
  })
})
