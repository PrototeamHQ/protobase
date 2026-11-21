import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RelayNotice } from '@protobase/client'
import { createRelayStore } from './relay-store'
import { typingShownMs } from './typing'

const notice = (resource: string, key: string, channel: string): RelayNotice => ({ kind: 'create', resource, key, channel })

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

describe('createRelayStore', () => {
  it('keeps typers until they run out, telling listeners each time', () => {
    const store = createRelayStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.handlers.onEvent!({ event: 'typing', payload: { typing: true }, from: { user: 'u2', connection: 'c' }, at: 0, channel: 'a/1' })
    expect(store.typers().get('a/1')?.has('u2')).toBe(true)
    vi.advanceTimersByTime(typingShownMs)
    expect(store.typers().size).toBe(0)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('shows nobody typing while the relay is down', () => {
    const store = createRelayStore()
    store.handlers.onEvent!({ event: 'typing', payload: { typing: true }, from: { user: 'u2', connection: 'c' }, at: 0, channel: 'a/1' })
    store.handlers.onStatus!('connecting')
    expect(store.typers().size).toBe(0)
  })

  it("shows every notice while it views no channel, and then only the viewed channel's and those of channel records", () => {
    const store = createRelayStore()
    expect(store.shows(notice('messages', '1', 'conversations/8'))).toBe(true)
    const heard = vi.fn()
    store.onView(heard)
    const unview = store.view('conversations/7')
    expect(heard).toHaveBeenCalledWith('conversations/7')
    expect(store.viewing('conversations/7')).toBe(true)
    expect(store.shows(notice('messages', '1', 'conversations/7'))).toBe(true)
    expect(store.shows(notice('messages', '2', 'conversations/8'))).toBe(false)
    expect(store.shows(notice('conversations', '8', 'conversations/8'))).toBe(true)
    unview()
    expect(store.shows(notice('messages', '2', 'conversations/8'))).toBe(true)
  })

  it('hands notices and resyncs on, clearing the typers on a resync, and remembers only the latest messages it sent', () => {
    const store = createRelayStore()
    const notices = vi.fn()
    const resyncs = vi.fn()
    store.onNotice(notices)
    store.onResync(resyncs)
    store.handlers.onEvent!({ event: 'typing', payload: { typing: true }, from: { user: 'u2', connection: 'c' }, at: 0, channel: 'a/1' })
    store.handlers.onNotice!(notice('messages', '1', 'a/1'))
    store.handlers.onResync!()
    expect(notices).toHaveBeenCalledTimes(1)
    expect(resyncs).toHaveBeenCalledTimes(1)
    expect(store.typers().size).toBe(0)
    for (let key = 0; key < 60; key += 1) store.sent(String(key))
    expect(store.own().has('9')).toBe(false)
    expect(store.own().has('59')).toBe(true)
    expect(store.own().size).toBe(50)
  })
})
