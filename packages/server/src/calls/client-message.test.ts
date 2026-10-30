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

  it('can name neither the sender, nor another call, nor ICE servers', () => {
    expect(parseClientMessage('{"type":"signal","to":"bob","from":"cy","candidate":{"candidate":"c"}}')).toBeUndefined()
    expect(parseClientMessage('{"type":"signal","to":"bob","call":"9","candidate":{"candidate":"c"}}')).toBeUndefined()
    expect(parseClientMessage('{"type":"join","call":"9"}')).toBeUndefined()
    expect(parseClientMessage('{"type":"join","iceServers":[{"urls":["turn:evil.example.com"]}]}')).toBeUndefined()
  })

  it("reads a member's guest requests, by ids and sources of the protocol only", () => {
    const guest = '7f1c2a4e-1b2c-4d3e-8f90-a1b2c3d4e5f6'
    expect(parseClientMessage('{"type":"guest-link","publish":["camera","microphone"]}')).toEqual({ type: 'guest-link', publish: ['camera', 'microphone'] })
    expect(parseClientMessage(`{"type":"guest-decide","guest":"${guest}","admit":true}`)).toEqual({ type: 'guest-decide', guest, admit: true })
    expect(parseClientMessage(`{"type":"guest-remove","guest":"${guest}"}`)).toEqual({ type: 'guest-remove', guest })
    expect(parseClientMessage('{"type":"guest-decide","guest":"guest:ann","admit":true}')).toBeUndefined()
    expect(parseClientMessage('{"type":"guest-link","publish":["speaker"]}')).toBeUndefined()
    expect(parseClientMessage('{"type":"guest-link","publish":[],"organization":"acme"}')).toBeUndefined()
    expect(parseClientMessage('{"type":"guest-link","publish":[],"expires_at":"2000-01-01T00:00:00Z"}')).toBeUndefined()
    expect(parseClientMessage('{"type":"guest-link","publish":[],"expires_at":"2999-01-01T00:00:00Z"}')).toEqual({ type: 'guest-link', publish: [], expires_at: '2999-01-01T00:00:00Z' })
  })

  it("carries a guest's token in a join or a resume", () => {
    expect(parseClientMessage('{"type":"join","guest":"pbg_x"}')).toEqual({ type: 'join', guest: 'pbg_x' })
  })
})
