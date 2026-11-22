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
})
