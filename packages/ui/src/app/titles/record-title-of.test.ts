import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { recordTitleOf, titleFieldsOf } from './record-title-of'
import type { TitleRule } from './title-rule'

const model = { name: 'direct_messages', primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' }, topic: { name: 'topic', type: 'text' }, member_ids: { name: 'member_ids', type: 'json' } } } as unknown as ResourceModel
const stored = { resource: 'direct_messages', title: 'topic', fields: {}, filters: [], layout: [], actions: [] } as unknown as ViewModel
const derived = { ...stored, titleFrom: { rule: 'memberNames', fields: ['member_ids'] } } as ViewModel

const names: Record<string, string> = { 'u-maya': 'Maya Jansen', 'u-sam': 'Sam Okafor' }
const memberNames: TitleRule = (record, reader) => {
  const others = (record.member_ids as string[]).filter((id) => id !== reader.user?.id).map((id) => reader.member(id)?.name)
  return others.every(Boolean) ? others.join(', ') : undefined
}
const reader = (id: string, known = true) => ({ user: { id } as AuthUser, member: (member: string) => (known && names[member] ? { id: member, name: names[member]! } : undefined) })
const row = { id: 'dm-1', topic: 'Stored', member_ids: ['u-maya', 'u-sam'] }

describe('recordTitleOf', () => {
  it('titles a record for each reader by the rule the view names', () => {
    expect(recordTitleOf({ memberNames }, reader('u-maya'))(model, derived, row, 'dm-1')).toBe('Sam Okafor')
    expect(recordTitleOf({ memberNames }, reader('u-sam'))(model, derived, row, 'dm-1')).toBe('Maya Jansen')
  })

  it('titles by the key while the rule has nothing to say, such as while the names load', () => {
    expect(recordTitleOf({ memberNames }, reader('u-maya', false))(model, derived, row, 'dm-1')).toBe('dm-1')
    expect(recordTitleOf({ memberNames: () => '' }, reader('u-maya'))(model, derived, row, 'dm-1')).toBe('dm-1')
  })

  it('titles by the key when the rule is not registered, a field it reads was not read, or the caller cannot read one', () => {
    expect(recordTitleOf({}, reader('u-maya'))(model, derived, row, 'dm-1')).toBe('dm-1')
    expect(recordTitleOf({ memberNames }, reader('u-maya'))(model, derived, { id: 'dm-1' }, 'dm-1')).toBe('dm-1')
    const unreadable = { ...stored, titleFrom: { rule: 'memberNames', fields: [], unreadable: true } } as ViewModel
    expect(recordTitleOf({ memberNames }, reader('u-maya'))(model, unreadable, row, 'dm-1')).toBe('dm-1')
  })

  it('titles a view without a derived title by its stored title, as before', () => {
    expect(recordTitleOf({ memberNames }, reader('u-maya'))(model, stored, row, 'dm-1')).toBe('Stored')
    expect(recordTitleOf({ memberNames }, reader('u-maya'))(model, stored, { ...row, topic: null }, 'dm-1')).toBe('dm-1')
  })
})

describe('titleFieldsOf', () => {
  it('names the fields a derived title reads, none for a stored title', () => {
    expect(titleFieldsOf(model, derived)).toEqual(['member_ids'])
    expect(titleFieldsOf(model, stored)).toEqual([])
  })
})
