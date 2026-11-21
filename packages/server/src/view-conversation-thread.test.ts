import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { readsThreads, threadErrors } from './view-conversation-thread'

const messages = resource('messages')
  .table('messages')
  .fields({ id: f.integer().readOnly(), thread_id: f.relation('messages').optional().filterable(), reply_count: f.integer().readOnly(), last_reply_at: f.timestamp().readOnly().optional(), body: f.text() })
  .primaryKey((r) => r.id)
  .toModel()

const thread = { field: 'thread_id', count: 'reply_count', last: 'last_reply_at' }

describe('threadErrors', () => {
  it('takes a filterable relation of the messages to themselves with a count and a last reply time', () => {
    expect(threadErrors(thread, messages)).toEqual([])
  })

  it('names fields of the wrong kind', () => {
    expect(threadErrors({ field: 'body', count: 'body', last: 'reply_count' }, messages)).toEqual([
      'field: "body" on messages is not filterable',
      'count: "body" is text; a thread\'s number of replies is an integer field',
      'last: "reply_count" is integer; a thread\'s last reply is a date or timestamp field',
    ])
  })
})

describe('readsThreads', () => {
  it('holds only for a caller who reads each of its fields', () => {
    expect(readsThreads(thread, messages)).toBe(true)
    const { reply_count: _, ...fields } = messages.fields
    expect(readsThreads(thread, { ...messages, fields })).toBe(false)
  })
})
