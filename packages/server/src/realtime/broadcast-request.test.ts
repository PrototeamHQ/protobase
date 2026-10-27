import { describe, expect, it } from 'vitest'
import { HttpProblem } from '../problem'
import { batchOf } from './broadcast-request'
import { realtimeLimits } from './realtime-limits'

const refusal = (body: unknown) => {
  try {
    batchOf(body)
  } catch (error) {
    if (error instanceof HttpProblem) return [error.status, error.detail]
    throw error
  }
  throw new Error('The batch was not refused')
}

describe('batchOf', () => {
  it('reads Supabase\'s messages as broadcasts on the topics the channels join, public unless private is true', () => {
    expect(batchOf({ messages: [{ topic: 'room', event: 'hi', payload: { n: 1 } }, { topic: 'room', event: 'hi', payload: {}, private: true }] })).toEqual([
      { topic: 'realtime:room', event: 'hi', payload: { n: 1 }, private: false },
      { topic: 'realtime:room', event: 'hi', payload: {}, private: true },
    ])
  })

  it('refuses a body without messages, and a message without a topic, an event or an object payload, with 422', () => {
    expect(refusal({})).toEqual([422, 'Send the broadcasts as a list of messages'])
    expect(refusal({ messages: [] })).toEqual([422, 'Send the broadcasts as a list of messages'])
    expect(refusal({ messages: ['hi'] })).toEqual([422, 'Each message is an object'])
    expect(refusal({ messages: [{ event: 'hi', payload: {} }] })).toEqual([422, 'Each message needs a topic'])
    expect(refusal({ messages: [{ topic: 'room', event: '', payload: {} }] })).toEqual([422, 'Each message needs an event'])
    expect(refusal({ messages: [{ topic: 'room', event: 'hi', payload: [1] }] })).toEqual([422, 'Each message needs a payload object'])
    expect(refusal({ messages: [{ topic: 'room', event: 'hi', payload: {}, private: 'yes' }] })).toEqual([422, 'A message\'s private is true or false'])
  })

  it('holds a message to the socket\'s topic and event sizes, and a batch to a socket\'s messages a second', () => {
    const topic = 'x'.repeat(255 - 'realtime:'.length)
    expect(batchOf({ messages: [{ topic, event: 'e'.repeat(255), payload: {} }] })).toHaveLength(1)
    expect(refusal({ messages: [{ topic: `${topic}x`, event: 'hi', payload: {} }] })).toEqual([422, 'A broadcast topic and event are at most 255 bytes each'])
    const message = { topic: 'room', event: 'hi', payload: {} }
    expect(batchOf({ messages: Array(realtimeLimits.eventsPerSecond).fill(message) })).toHaveLength(realtimeLimits.eventsPerSecond)
    expect(refusal({ messages: Array(realtimeLimits.eventsPerSecond + 1).fill(message) })[0]).toBe(429)
  })
})
