import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { listLabels } from './relation-labels'

const directMessages = { name: 'direct_messages', primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' }, topic: { name: 'topic', type: 'text' } } } as unknown as ResourceModel
const channels = { name: 'channels', primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' }, name: { name: 'name', type: 'text' } } } as unknown as ResourceModel
const messages = {
  name: 'messages',
  primaryKey: ['id'],
  fields: {
    id: { name: 'id', type: 'text' },
    direct_message_id: { name: 'direct_message_id', type: 'relation', relation: { resource: 'direct_messages' } },
    channel_id: { name: 'channel_id', type: 'relation', relation: { resource: 'channels' } },
  },
} as unknown as ResourceModel
const resources = { messages, direct_messages: directMessages, channels }

describe('listLabels', () => {
  it('asks the label field of each relation, but none for a resource whose view derives its titles', () => {
    const stored = { resource: 'direct_messages', title: 'topic' } as unknown as ViewModel
    const derived = { ...stored, titleFrom: { rule: 'memberNames', fields: ['member_ids'] } }
    expect(listLabels(resources, { direct_messages: derived }, messages, ['direct_message_id', 'channel_id'])).toEqual({ channel_id: 'name' })
    expect(listLabels(resources, { direct_messages: stored }, messages, ['direct_message_id', 'channel_id'])).toEqual({ direct_message_id: 'topic', channel_id: 'name' })
  })
})
