import { describe, expect, it } from 'vitest'
import type { ViewModel } from '@protobase/schema'
import { relayClientEvents, typingClientEvent, typingResources } from './client-events'

const conversation = (resource: string, typing?: true) =>
  ({ resource, record: { conversation: { resource: 'messages', field: 'room_id', sender: 'author_id', time: 'created_at', text: 'body', ...(typing && { typing }) } } }) as unknown as ViewModel

describe('typingResources', () => {
  it('names the resources whose conversation page types', () => {
    expect(typingResources([conversation('rooms', true), conversation('notes'), { resource: 'tasks' } as ViewModel])).toEqual(new Set(['rooms']))
  })
})

describe('relayClientEvents', () => {
  it('is undefined without any event, so clients send nothing', () => {
    expect(relayClientEvents({ rooms: {} }, new Set())).toBeUndefined()
  })

  it('declares typing only on the channels of a typing resource', () => {
    expect(relayClientEvents({ rooms: {}, notes: {} }, new Set(['rooms']))?.channels).toEqual({ rooms: { events: { typing: expect.objectContaining({ max_bytes: typingClientEvent.maxBytes }) } } })
  })

  it("takes the framework's typing payloads, in and outside a thread, within their size", () => {
    const { schema, maxBytes } = typingClientEvent
    expect(schema).toMatchObject({ required: ['typing'], properties: { thread: { type: ['string', 'number', 'null'] } } })
    expect(new TextEncoder().encode(JSON.stringify({ typing: false, thread: 'f'.repeat(200) })).length).toBeLessThan(maxBytes)
  })

  it('writes limits read from the environment as the numbers the relay reads', () => {
    const ring = { schema: { type: 'object' }, maxBytes: '512', perSecond: '0.5', burst: '2' } as never
    expect(relayClientEvents({ rooms: { events: { ring } } }, new Set())?.channels.rooms?.events.ring).toEqual({ schema: { type: 'object' }, max_bytes: 512, per_second: 0.5, burst: 2 })
  })
})
