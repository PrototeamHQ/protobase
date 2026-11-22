import { describe, expect, it } from 'vitest'
import { messagesRequest, ownPositionFilter, recordsPageSize, readOfMessages, repliesRequest } from './conversation-reads'

describe('messagesRequest', () => {
  it("reads only the record's messages, newest first, a page at a time", () => {
    expect(messagesRequest({ field: 'channel_id', time: 'sent_at' }, '5')).toEqual({ filter: 'channel_id = "5"', orderBy: 'sent_at desc', pageSize: 50 })
  })

  it('leaves out the replies in threads', () => {
    expect(messagesRequest({ field: 'channel_id', time: 'sent_at', thread: { field: 'thread_id', count: 'reply_count', last: 'last_reply_at' } }, '5').filter).toBe('channel_id = "5" AND isNull(thread_id)')
  })

  it('quotes a key that would otherwise widen the read', () => {
    expect(messagesRequest({ field: 'channel_id', time: 'sent_at' }, '5" OR channel_id != "6').filter).toBe('channel_id = "5\\" OR channel_id != \\"6"')
  })
})

describe('ownPositionFilter', () => {
  it("reads the reader's own position in the record alone", () => {
    expect(ownPositionFilter({ field: 'channel_id' }, '5', 'user_id', 'u-maya')).toBe('channel_id = "5" AND user_id = "u-maya"')
  })

  it("quotes a reader id that would otherwise read someone else's", () => {
    expect(ownPositionFilter({ field: 'channel_id' }, '5', 'user_id', 'x" OR user_id != "y')).toBe('channel_id = "5" AND user_id = "x\\" OR user_id != \\"y"')
  })
})

describe('repliesRequest', () => {
  it("reads the replies in one message's thread, newest first", () => {
    expect(repliesRequest({ time: 'sent_at' }, { field: 'thread_id', count: 'reply_count', last: 'last_reply_at' }, '12')).toEqual({ filter: 'thread_id = "12"', orderBy: 'sent_at desc', pageSize: 50 })
  })
})

describe('readOfMessages', () => {
  it("reads a page of messages' reactions in one read, and on while the API has more", async () => {
    const calls: unknown[] = []
    const pages = [{ items: [{ id: 1 }], nextPageToken: 'next' }, { items: [{ id: 2 }], nextPageToken: '' }]
    const client = { list: async (resource: string, params: unknown) => (calls.push([resource, params]), pages[calls.length - 1]!) }
    expect(await readOfMessages(client as never, { resource: 'reactions', field: 'message_id' }, ['5', '6'])).toEqual([{ id: 1 }, { id: 2 }])
    expect(calls).toEqual([
      ['reactions', { filter: 'in(message_id, "5", "6")', pageSize: recordsPageSize, pageToken: '' }],
      ['reactions', { filter: 'in(message_id, "5", "6")', pageSize: recordsPageSize, pageToken: 'next' }],
    ])
  })
})

describe('the files of a page of messages', () => {
  it('are read in one request for the whole page, not one per message', async () => {
    const calls: unknown[] = []
    const client = { list: async (resource: string, params: unknown) => (calls.push([resource, params]), { items: [{ id: 1 }, { id: 2 }], nextPageToken: '' }) }
    expect(await readOfMessages(client as never, { resource: 'attachments', field: 'message_id' }, ['5', '6', '7'])).toEqual([{ id: 1 }, { id: 2 }])
    expect(calls).toEqual([['attachments', { filter: 'in(message_id, "5", "6", "7")', pageSize: recordsPageSize, pageToken: '' }]])
  })
})
