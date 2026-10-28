import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { recordTitleOf } from './record-title-of'
import { relationTitle, relationTitleQuery } from './relation-title'

const target = { name: 'direct_messages', primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' }, topic: { name: 'topic', type: 'text' }, member_ids: { name: 'member_ids', type: 'json' } } } as unknown as ResourceModel
const stored = { resource: 'direct_messages', title: 'topic', fields: {}, filters: [], layout: [], actions: [] } as unknown as ViewModel
const derived = { ...stored, titleFrom: { rule: 'others', fields: ['member_ids'] } } as ViewModel
const row = { id: 'dm-1', topic: 'Launch', member_ids: ['u-maya', 'u-sam'] }
const titleOf = recordTitleOf({ others: (record, reader) => (record.member_ids as string[]).filter((id) => id !== reader.user?.id).join(', ') }, { user: { id: 'u-maya' } as never, member: () => undefined })

const clientWith = (items: Record<string, unknown>[]) => ({ list: vi.fn(async () => ({ items, nextPageToken: '' })) }) as unknown as Client & { list: ReturnType<typeof vi.fn> }

describe('relationTitleQuery', () => {
  it('reads the label field of a stored title', async () => {
    const client = clientWith([row])
    const query = relationTitleQuery(new QueryClient(), client, target, stored, 'dm-1')
    expect(await query.queryFn()).toEqual({ label: 'Launch' })
    expect(client.list).toHaveBeenCalledWith('direct_messages', expect.objectContaining({ fields: ['id', 'topic'] }))
  })

  it('reads the fields a derived title reads, which relationTitle titles for the reader', async () => {
    const client = clientWith([row])
    const query = relationTitleQuery(new QueryClient(), client, target, derived, 'dm-1')
    const data = await query.queryFn()
    expect(client.list).toHaveBeenCalledWith('direct_messages', expect.objectContaining({ fields: ['id', 'member_ids'], pageSize: 1 }))
    expect(relationTitle(data, titleOf, target, derived, 'dm-1')).toBe('u-sam')
  })

  it('names a record not found by its key, and nothing while it loads', async () => {
    const data = await relationTitleQuery(new QueryClient(), clientWith([]), target, derived, 'dm-9').queryFn()
    expect(relationTitle(data, titleOf, target, derived, 'dm-9')).toBe('dm-9')
    expect(relationTitle(undefined, titleOf, target, derived, 'dm-9')).toBeUndefined()
  })
})
