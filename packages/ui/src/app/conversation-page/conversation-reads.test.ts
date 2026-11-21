import { describe, expect, it } from 'vitest'
import { messagesRequest, ownPositionFilter } from './conversation-reads'

describe('messagesRequest', () => {
  it("reads only the record's messages, newest first, a page at a time", () => {
    expect(messagesRequest({ field: 'channel_id', time: 'sent_at' }, '5')).toEqual({ filter: 'channel_id = "5"', orderBy: 'sent_at desc', pageSize: 50 })
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
