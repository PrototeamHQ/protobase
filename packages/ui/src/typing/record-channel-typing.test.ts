import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelRefusal, type Channel, type ChannelMessage, type ChannelStatus } from '@protobase/client'
import { followRecordTyping } from './record-channel-typing'
import { createTypersStore } from './typers-store'
import { typersOn, typingShownMs, typingSpot } from './typing'

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

// A record's channel as the client holds it, whose status and broadcasts a test sets.
const fakeChannel = () => {
  let status: ChannelStatus = { state: 'joining' }
  const statusListeners = new Set<(status: ChannelStatus) => void>()
  const listeners = new Map<string, Set<(message: ChannelMessage) => void>>()
  const send = vi.fn(async (_event: string, _payload: unknown) => {})
  const channel = {
    status: () => status,
    onStatus: (listener: (status: ChannelStatus) => void) => {
      statusListeners.add(listener)
      return () => void statusListeners.delete(listener)
    },
    on: (event: string, listener: (message: ChannelMessage) => void) => {
      const set = listeners.get(event) ?? new Set()
      listeners.set(event, set)
      set.add(listener)
      return () => void set.delete(listener)
    },
    send,
  } as unknown as Channel
  return {
    channel,
    send,
    setStatus: (next: ChannelStatus) => {
      status = next
      for (const listener of statusListeners) listener(next)
    },
    hear: (message: ChannelMessage) => {
      for (const listener of listeners.get(message.event) ?? []) listener(message)
    },
    listening: () => [...listeners.values()].reduce((count, set) => count + set.size, 0) + statusListeners.size,
  }
}

describe('followRecordTyping', () => {
  it('shows who types in their thread or outside threads, until it runs out, but not the server', () => {
    const fake = fakeChannel()
    const store = createTypersStore()
    followRecordTyping(fake.channel, 'rooms/1', store)
    fake.setStatus({ state: 'joined' })
    fake.hear({ event: 'typing', payload: { typing: true, thread: null }, user: 'u2' })
    fake.hear({ event: 'typing', payload: { typing: true, thread: 9 }, user: 3 })
    fake.hear({ event: 'typing', payload: { typing: true, thread: null }, user: null, server: true })
    expect(typersOn(store.typers(), typingSpot('rooms/1', null), 'me')).toEqual(['u2'])
    expect(typersOn(store.typers(), typingSpot('rooms/1', '9'), 'me')).toEqual(['3'])
    vi.advanceTimersByTime(typingShownMs)
    expect(store.typers().size).toBe(0)
  })

  it('sends only once joined, drops a refused send, and shows nobody once the channel is down', async () => {
    const fake = fakeChannel()
    const store = createTypersStore()
    const typing = followRecordTyping(fake.channel, 'rooms/1', store)
    expect(typing.send({ typing: true, thread: null })).toBe(false)
    fake.setStatus({ state: 'joined' })
    fake.send.mockRejectedValueOnce(new ChannelRefusal('rate-limited', 'Too many'))
    expect(typing.send({ typing: true, thread: null })).toBe(true)
    expect(fake.send).toHaveBeenCalledWith('typing', { typing: true, thread: null })
    // The refused send is dropped in a microtask: running every timer instead would also run any timer another file of
    // this worker left, which unit tests share.
    await Promise.resolve()
    fake.hear({ event: 'typing', payload: { typing: true }, user: 'u2' })
    fake.setStatus({ state: 'joining' })
    expect(store.typers().size).toBe(0)
  })

  it('stops following and forgets the typers', () => {
    const fake = fakeChannel()
    const store = createTypersStore()
    const typing = followRecordTyping(fake.channel, 'rooms/1', store)
    fake.setStatus({ state: 'joined' })
    fake.hear({ event: 'typing', payload: { typing: true }, user: 'u2' })
    typing.stop()
    expect(store.typers().size).toBe(0)
    expect(fake.listening()).toBe(0)
  })
})
