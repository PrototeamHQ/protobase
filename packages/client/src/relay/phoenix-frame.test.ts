import { describe, expect, it } from 'vitest'
import { decodeFrame, encodeFrame, replyOf } from './phoenix-frame'

describe('phoenix frames', () => {
  it('encodes and decodes the V2 array shape', () => {
    const frame = { joinRef: '1', ref: '2', topic: 'conversations/7', event: 'phx_join', payload: {} }
    expect(encodeFrame(frame)).toBe('["1","2","conversations/7","phx_join",{}]')
    expect(decodeFrame(encodeFrame(frame))).toEqual(frame)
  })

  it('reads a broadcast without refs, and passes over what is no frame', () => {
    expect(decodeFrame('[null,null,"conversations/7","change",{"kind":"create"}]')).toEqual({ joinRef: null, ref: null, topic: 'conversations/7', event: 'change', payload: { kind: 'create' } })
    expect(decodeFrame('{"topic":"x"}')).toBeUndefined()
    expect(decodeFrame('[null,null,"x","y"]')).toBeUndefined()
  })

  it('reads a reply as ok, or as an error with its reason', () => {
    expect(replyOf({ status: 'ok', response: {} })).toEqual({ ok: true })
    expect(replyOf({ status: 'error', response: { reason: 'unauthorized' } })).toEqual({ ok: false, reason: 'unauthorized' })
  })
})
