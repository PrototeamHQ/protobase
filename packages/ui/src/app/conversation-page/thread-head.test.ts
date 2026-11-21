import { describe, expect, it } from 'vitest'
import { inConversation } from './thread-head'

describe('inConversation', () => {
  it("takes a first message of the record's conversation, its key a number or text", () => {
    expect(inConversation({ channel_id: 1 }, 'channel_id', '1')).toBe(true)
    expect(inConversation({ channel_id: 'general' }, 'channel_id', 'general')).toBe(true)
  })

  it("refuses one of another conversation, or of none the reader can see", () => {
    expect(inConversation({ channel_id: 2 }, 'channel_id', '1')).toBe(false)
    expect(inConversation({ channel_id: null }, 'channel_id', '1')).toBe(false)
    expect(inConversation({}, 'channel_id', '1')).toBe(false)
  })
})
