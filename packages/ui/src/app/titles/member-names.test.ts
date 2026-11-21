import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { otherMembers } from './member-names'
import { recordTitleOf } from './record-title-of'

const model = { name: 'direct_messages', primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' }, member_ids: { name: 'member_ids', type: 'json' } } } as unknown as ResourceModel
const view = { resource: 'direct_messages', fields: {}, filters: [], layout: [], actions: [], titleFrom: { rule: 'members', fields: ['member_ids'] } } as unknown as ViewModel

const names: Record<string, string> = { 'u-maya': 'Maya Jansen', 'u-sam': 'Sam Okafor', 'u-lin': 'Lin Park' }
const reader = (id: string, known = Object.keys(names)) => ({ user: { id } as AuthUser, member: (member: string) => (known.includes(member) ? { id: member, name: names[member]! } : undefined) })

describe('the members title rule', () => {
  it('names the people other than the reader, in the order they were added, with no rule of the app', () => {
    const row = { id: 'dm-1', member_ids: ['u-maya', 'u-sam', 'u-lin'] }
    expect(recordTitleOf({}, reader('u-maya'))(model, view, row, 'dm-1')).toBe('Sam Okafor, Lin Park')
    expect(recordTitleOf({}, reader('u-sam'))(model, view, row, 'dm-1')).toBe('Maya Jansen, Lin Park')
  })

  it('titles by the key until every name is known, and for a field without people', () => {
    expect(recordTitleOf({}, reader('u-maya', ['u-sam']))(model, view, { id: 'dm-1', member_ids: ['u-maya', 'u-sam', 'u-lin'] }, 'dm-1')).toBe('dm-1')
    expect(recordTitleOf({}, reader('u-maya'))(model, view, { id: 'dm-1', member_ids: ['u-maya'] }, 'dm-1')).toBe('dm-1')
    expect(recordTitleOf({}, reader('u-maya'))(model, view, { id: 'dm-1', member_ids: null }, 'dm-1')).toBe('dm-1')
  })
})

describe('otherMembers', () => {
  it('leaves out the reader and anything that is no user id', () => {
    expect(otherMembers(['u-maya', 'u-sam', 7], 'u-maya')).toEqual(['u-sam'])
    expect(otherMembers('u-sam', 'u-maya')).toEqual([])
  })
})
