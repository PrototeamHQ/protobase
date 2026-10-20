import { describe, expect, it } from 'vitest'
import { decodeBroadcastPush, encodeBroadcast } from './broadcast-frame'

const encoder = new TextEncoder()

// A push as realtime-js's serializer writes it: kind 3, the lengths of its fields, the payload's encoding, fields, payload.
const push = (fields: [string, string, string, string, string], encoding: number, body: Uint8Array) => {
  const bytes = fields.map((field) => encoder.encode(field))
  return new Uint8Array([3, ...bytes.map((field) => field.length), encoding, ...bytes.flatMap((field) => [...field]), ...body]).buffer
}

describe('decodeBroadcastPush', () => {
  it('reads a JSON broadcast, dropping its metadata', () => {
    const frame = push(['1', '2', 'realtime:room', 'cursor', '{"replay":1}'], 1, encoder.encode('{"x":1,"name":"Zoë"}'))
    expect(decodeBroadcastPush(frame)).toEqual({ joinRef: '1', ref: '2', topic: 'realtime:room', event: 'broadcast', payload: { type: 'broadcast', event: 'cursor', payload: { x: 1, name: 'Zoë' } } })
  })

  it('keeps a binary broadcast\'s bytes, and an empty ref as none', () => {
    const decoded = decodeBroadcastPush(push(['1', '', 'realtime:room', 'blob', ''], 0, new Uint8Array([7, 8])))
    expect(decoded?.ref).toBeNull()
    expect([...new Uint8Array(decoded?.payload.payload as ArrayBuffer)]).toEqual([7, 8])
  })

  it('refuses another kind, a frame cut short and JSON that does not parse', () => {
    expect(decodeBroadcastPush(new Uint8Array([4, 0, 0, 0, 0, 0, 1]).buffer)).toBeUndefined()
    expect(decodeBroadcastPush(new Uint8Array([3, 9, 0, 0, 0, 0, 1]).buffer)).toBeUndefined()
    expect(decodeBroadcastPush(push(['1', '2', 'realtime:room', 'cursor', ''], 1, encoder.encode('{')))).toBeUndefined()
  })
})

describe('encodeBroadcast', () => {
  it('writes kind 4 with the topic, event, no metadata and the payload as JSON or bytes', () => {
    expect([...new Uint8Array(encodeBroadcast('t', 'e', { a: 1 }))]).toEqual([4, 1, 1, 0, 1, ...encoder.encode('te{"a":1}')])
    expect([...new Uint8Array(encodeBroadcast('t', 'e', new Uint8Array([5]).buffer))]).toEqual([4, 1, 1, 0, 0, ...encoder.encode('te'), 5])
  })
})
