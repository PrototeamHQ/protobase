import { describe, expect, it } from 'vitest'
import type { RelayNotice } from '@protobase/client'
import { conversationKey, countNotice, opened, unreadFilter } from './unread'

const source = { conversations: 'conversations', messages: 'messages' }
const message = (key: string, channel = 'conversations/7', kind: RelayNotice['kind'] = 'create'): RelayNotice => ({ kind, resource: 'messages', key, channel })
const closed = () => false

describe('countNotice', () => {
  it('counts a new message on its conversation without reading anything', () => {
    expect(countNotice({}, message('41'), source, closed, new Set())).toEqual({ 7: 1 })
    expect(countNotice({ 7: 1 }, message('42'), source, closed, new Set())).toEqual({ 7: 2 })
  })

  it('passes over an edit, another resource, another channel resource, the open conversation and a message the page sent', () => {
    const counts = { 7: 1 }
    expect(countNotice(counts, message('41', 'conversations/7', 'update'), source, closed, new Set())).toBe(counts)
    expect(countNotice(counts, { ...message('41'), resource: 'reactions' }, source, closed, new Set())).toBe(counts)
    expect(countNotice(counts, message('41', 'rooms/7'), source, closed, new Set())).toBe(counts)
    expect(countNotice(counts, message('41'), source, (channel) => channel === 'conversations/7', new Set())).toBe(counts)
    expect(countNotice(counts, message('41'), source, closed, new Set(['41']))).toBe(counts)
  })

  it('has nothing unread in a conversation once opened', () => {
    expect(opened({ 7: 3, 8: 1 }, '7')).toEqual({ 7: 0, 8: 1 })
    const none = { 8: 1 }
    expect(opened(none, '7')).toBe(none)
  })

  it("names a channel's conversation", () => {
    expect(conversationKey('conversations/7', 'conversations')).toBe('7')
    expect(conversationKey('rooms/7', 'conversations')).toBeUndefined()
  })
})

describe('unreadFilter', () => {
  it("reads each conversation's messages after its own position, by someone else", () => {
    expect(unreadFilter('conversation_id', 'id', 'author_id', 'u1', [{ key: '7', readTo: 40 }, { key: 'abc', readTo: 0 }])).toBe(
      'author_id != "u1" AND ((conversation_id = 7 AND id > 40) OR (conversation_id = "abc" AND id > 0))',
    )
    expect(unreadFilter('conversation_id', 'id', 'author_id', 'u1', [])).toBeUndefined()
  })
})
