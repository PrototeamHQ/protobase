import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@protobase/client'
import type { ConversationPageModel, ResourceModel } from '@protobase/schema'
import { countUnread } from './count-unread'

const page: ConversationPageModel = { resource: 'messages', field: 'conversation_id', sender: 'author_id', time: 'created_at', text: 'body', readPosition: { resource: 'read_positions', field: 'conversation_id', message: 'last_read_id' } }
const models = {
  messages: { name: 'messages', primaryKey: ['id'], fields: {} },
  read_positions: { name: 'read_positions', primaryKey: ['id'], author: 'user_id', fields: { user_id: { filterable: true } } },
} as unknown as Record<string, ResourceModel>

describe('countUnread', () => {
  it("counts in two reads: the reader's positions, then the messages after each, grouped by the database", async () => {
    const list = vi.fn(async () => ({ items: [{ conversation_id: 7, last_read_id: 40 }] }))
    const aggregate = vi.fn(async () => ({ groupBy: 'conversation_id', groups: [{ value: 7, count: 2 }, { value: 8, count: 5 }] }))
    const client = { list, aggregate } as unknown as Client
    expect(await countUnread(client, models, page, ['7', '8', '9'], 'u1')).toEqual({ 7: 2, 8: 5, 9: 0 })
    expect(list).toHaveBeenCalledWith('read_positions', { filter: 'user_id = "u1" AND (conversation_id = 7 OR conversation_id = 8 OR conversation_id = 9)', pageSize: 3, fields: ['conversation_id', 'last_read_id'] })
    expect(aggregate).toHaveBeenCalledWith('messages', {
      groupBy: 'conversation_id',
      filter: 'author_id != "u1" AND ((conversation_id = 7 AND id > 40) OR (conversation_id = 8 AND id > 0) OR (conversation_id = 9 AND id > 0))',
      limit: 3,
    })
  })

  it('reads nothing for no conversations or a page without read positions', async () => {
    const client = { list: vi.fn(), aggregate: vi.fn() } as unknown as Client
    expect(await countUnread(client, models, page, [], 'u1')).toEqual({})
    expect(await countUnread(client, models, { ...page, readPosition: undefined }, ['7'], 'u1')).toEqual({})
    expect(client.list).not.toHaveBeenCalled()
  })

  it("reads only the reader's own positions, and nothing when the position resource has no author", async () => {
    const list = vi.fn(async () => ({ items: [] }))
    const aggregate = vi.fn(async () => ({ groupBy: 'conversation_id', groups: [] }))
    const client = { list, aggregate } as unknown as Client
    const unfiltered = { ...models, read_positions: { ...models.read_positions!, fields: {} } }
    await countUnread(client, unfiltered, page, ['7'], 'u1')
    expect(list).toHaveBeenCalledWith('read_positions', expect.objectContaining({ filter: 'user_id = "u1" AND (conversation_id = 7)' }))
    const authorless = { ...models, read_positions: { ...models.read_positions!, author: undefined } }
    list.mockClear()
    expect(await countUnread(client, authorless, page, ['7'], 'u1')).toEqual({})
    expect(list).not.toHaveBeenCalled()
  })
})
