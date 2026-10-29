import { describe, expect, it } from 'vitest'
import { parseClientMessage } from './client-message'

describe('a browser\'s call message', () => {
  it('is read when it is one of the protocol', () => {
    expect(parseClientMessage('{"type":"offer","sdp":"v=0","id":3}')).toEqual({ type: 'offer', sdp: 'v=0', id: 3 })
    expect(parseClientMessage('{"type":"publish","tracks":[{"cid":"a","kind":"audio","source":"microphone"}]}')).toEqual({ type: 'publish', tracks: [{ cid: 'a', kind: 'audio', source: 'microphone' }] })
  })

  it('is nothing when it is not JSON, binary, or has other fields', () => {
    expect(parseClientMessage('{nope')).toBeUndefined()
    expect(parseClientMessage(new ArrayBuffer(4))).toBeUndefined()
    expect(parseClientMessage('{"type":"leave","extra":1}')).toBeUndefined()
    expect(parseClientMessage('{"type":"publish","tracks":[{"cid":"a","kind":"audio","source":"speaker"}]}')).toBeUndefined()
  })
})
