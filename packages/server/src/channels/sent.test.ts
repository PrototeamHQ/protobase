import { describe, expect, it } from 'vitest'
import { packSent, unpackSent } from './sent'

describe('packSent', () => {
  it('packs a broadcast of bytes into one ArrayBuffer, as the relay carries bytes, and unpacks it whole', () => {
    const sent = { user: null, server: true as const, payload: new Uint8Array([1, 2, 3]).buffer }
    const packed = packSent(sent)
    expect(packed).toBeInstanceOf(ArrayBuffer)
    const unpacked = unpackSent(packed)
    expect({ ...unpacked, payload: [...new Uint8Array(unpacked.payload as ArrayBuffer)] }).toEqual({ user: null, server: true, payload: [1, 2, 3] })
    expect(unpackSent(packSent({ user: 'alice', payload: new ArrayBuffer(0) }))).toEqual({ user: 'alice', payload: new ArrayBuffer(0) })
  })

  it('leaves a JSON broadcast as it is', () => {
    const sent = { user: 7, payload: { text: 'hi' } }
    expect(packSent(sent)).toBe(sent)
    expect(unpackSent(sent)).toBe(sent)
  })
})
