import { describe, expect, it } from 'vitest'
import { bytesOf, decodeBinaryFrame, encodeBinaryFrame } from './binary-frame'

describe('binary frames', () => {
  it('carry a JSON header after its 32-bit length, then the bytes', () => {
    const frame = encodeBinaryFrame({ event: 'é' }, new Uint8Array([9, 8]).buffer)
    expect([...new Uint8Array(frame)]).toEqual([0, 0, 0, 14, ...new TextEncoder().encode('{"event":"é"}'), 9, 8])
    const decoded = decodeBinaryFrame(frame)!
    expect(decoded.header).toEqual({ event: 'é' })
    expect([...new Uint8Array(decoded.bytes)]).toEqual([9, 8])
  })

  it('refuse a frame cut short or whose header is not a JSON object', () => {
    expect(decodeBinaryFrame(new Uint8Array([0, 0, 0]).buffer)).toBeUndefined()
    expect(decodeBinaryFrame(new Uint8Array([0, 0, 0, 9, 123]).buffer)).toBeUndefined()
    const notObject = new TextEncoder().encode('[1]')
    expect(decodeBinaryFrame(new Uint8Array([0, 0, 0, 3, ...notObject]).buffer)).toBeUndefined()
    expect(decodeBinaryFrame(new Uint8Array([0, 0, 0, 2, 123, 125]).buffer)).toEqual({ header: {}, bytes: new ArrayBuffer(0) })
  })

  it('take the bytes of a typed array, only those its view covers', () => {
    const view = new Uint8Array([1, 2, 3, 4]).subarray(1, 3)
    expect([...new Uint8Array(bytesOf(view)!)]).toEqual([2, 3])
    expect(bytesOf({})).toBeUndefined()
  })
})
