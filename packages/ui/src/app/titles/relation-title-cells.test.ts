import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { ColumnSpec } from '../../data-grid/column-spec'
import { withRelationTitleCells } from './relation-title-cells'

const directMessages = { name: 'direct_messages', primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' } } } as unknown as ResourceModel
const channels = { name: 'channels', primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' } } } as unknown as ResourceModel
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
const views = { direct_messages: { resource: 'direct_messages', titleFrom: { rule: 'memberNames', fields: ['member_ids'] } } as ViewModel }
const column = (id: string): ColumnSpec => ({ id, header: id, kind: 'relation', width: 200 })

describe('withRelationTitleCells', () => {
  it('draws a relation to a resource whose view derives its titles by the record it points at, and leaves the others', () => {
    const [derived, stored] = withRelationTitleCells([column('direct_message_id'), column('channel_id')], messages, resources, views)
    expect(stored!.render).toBeUndefined()
    const cell = derived!.render!({ id: 'm-1', direct_message_id: { id: 'dm-1', name: 'dm-1' } })
    expect(isValidElement(cell) && cell.props).toEqual({ target: directMessages, id: 'dm-1' })
  })

  it('draws an empty relation as the built-in cell does, and keeps a field type drawing the column', () => {
    const [derived] = withRelationTitleCells([column('direct_message_id')], messages, resources, views)
    expect(isValidElement(derived!.render!({ id: 'm-1', direct_message_id: null }))).toBe(true)
    const drawn = { ...column('direct_message_id'), render: () => 'drawn' }
    expect(withRelationTitleCells([drawn], messages, resources, views)[0]).toBe(drawn)
  })
})
