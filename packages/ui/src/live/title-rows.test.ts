import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { seedTitleRows, titleRowKey } from './title-rows'

const directMessages = { name: 'direct_messages', primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' }, member_ids: { name: 'member_ids', type: 'json' } } } as unknown as ResourceModel
const channels = { name: 'channels', primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' }, name: { name: 'name', type: 'text' } } } as unknown as ResourceModel
const messages = {
  name: 'messages',
  primaryKey: ['id'],
  fields: {
    id: { name: 'id', type: 'text' },
    direct_message_id: { name: 'direct_message_id', type: 'relation', relation: { resource: 'direct_messages' } },
    reply_to_dm_id: { name: 'reply_to_dm_id', type: 'relation', relation: { resource: 'direct_messages' } },
    channel_id: { name: 'channel_id', type: 'relation', relation: { resource: 'channels' } },
  },
} as unknown as ResourceModel
const resources = { messages, direct_messages: directMessages, channels }
const views = { direct_messages: { resource: 'direct_messages', titleFrom: { rule: 'memberNames', fields: ['member_ids'] } } as ViewModel }

const clientWith = (items: Record<string, unknown>[]) => ({ list: vi.fn(async () => ({ items, nextPageToken: '' })) }) as unknown as Client & { list: ReturnType<typeof vi.fn> }

describe('seedTitleRows', () => {
  it('reads the title fields of the records a page points at in one call per resource, and caches each, null when not found', async () => {
    const client = clientWith([{ id: 'dm-1', member_ids: ['u-maya', 'u-sam'] }])
    const queryClient = new QueryClient()
    const rows = [
      { id: 'm-1', direct_message_id: 'dm-1', reply_to_dm_id: 'dm-2', channel_id: 'c-1' },
      { id: 'm-2', direct_message_id: 'dm-1', reply_to_dm_id: null, channel_id: 'c-1' },
    ]
    await seedTitleRows(queryClient, client, resources, views, messages, ['direct_message_id', 'reply_to_dm_id', 'channel_id'], rows)
    expect(client.list).toHaveBeenCalledTimes(1)
    expect(client.list).toHaveBeenCalledWith('direct_messages', { filter: 'in(id, "dm-1", "dm-2")', fields: ['id', 'member_ids'], pageSize: 2 })
    expect(queryClient.getQueryData(titleRowKey(directMessages, 'dm-1', ['member_ids']))).toEqual({ row: { id: 'dm-1', member_ids: ['u-maya', 'u-sam'] } })
    expect(queryClient.getQueryData(titleRowKey(directMessages, 'dm-2', ['member_ids']))).toEqual({ row: null })
  })

  it('asks nothing for relations to resources titled by a stored field, or a page without values', async () => {
    const client = clientWith([])
    await seedTitleRows(new QueryClient(), client, resources, views, messages, ['channel_id', 'direct_message_id'], [{ id: 'm-1', channel_id: 'c-1', direct_message_id: null }])
    expect(client.list).not.toHaveBeenCalled()
  })
})
