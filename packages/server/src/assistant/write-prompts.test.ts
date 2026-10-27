import type { ResourceModel, ViewModel } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { writeText } from './write-messages'
import { createApproval, deleteApproval, describedResource, updateApproval } from './write-prompts'

const model = {
  name: 'people',
  primaryKey: ['id'],
  fields: {
    id: { name: 'id', type: 'bigint' },
    name: { name: 'name', type: 'text' },
    active: { name: 'active', type: 'boolean' },
    password: { name: 'password', type: 'text', sensitive: true },
    tags: { name: 'tags', type: 'json' },
    notes: { name: 'notes', type: 'text' },
  },
} as unknown as ResourceModel
const view = { resource: 'people', fields: { name: { label: 'Full name' } } } as unknown as ViewModel
const people = describedResource({ models: [model], views: [view] }, 'people')
const en = writeText('en')

describe('write approvals', () => {
  it('show a boolean as yes or no, an object as JSON, and never a sensitive value', () => {
    expect(createApproval(en, people, { name: 'Ann', active: true, password: 'hunter2', tags: ['a', 'b'] }).fields).toEqual([
      { label: 'Full name', value: 'Ann' },
      { label: 'Active', value: 'Yes' },
      { label: 'Password', value: 'hidden' },
      { label: 'Tags', value: '["a","b"]' },
    ])
  })

  it('cut a long value at 200 characters and put any value on one line', () => {
    const [notes] = createApproval(en, people, { notes: `${'x'.repeat(300)}` }).fields!
    expect(notes!.value).toHaveLength(200)
    expect(notes!.value.endsWith('…')).toBe(true)
    expect(createApproval(en, people, { notes: 'a\r\nb​c' }).fields).toEqual([{ label: 'Notes', value: 'a  b c' }])
  })

  it('name a new record without a title by its resource alone', () => {
    expect(createApproval(en, people, { active: false }).title).toBe('Create People?')
  })

  it('list a field the caller cannot read before by its new value, a sensitive one hidden', () => {
    const asked = updateApproval(en, people, 3, { id: 3, name: 'Ann', active: true }, { active: true, password: 'x', name: 'Ann B' })
    expect(asked.title).toBe('Update People #3 "Ann"?')
    expect(asked.fields).toEqual([{ label: 'Password', value: 'hidden' }, { label: 'Full name', value: 'Ann -> Ann B' }])
  })

  it('say a delete of a resource without soft delete is for good, in red', () => {
    expect(deleteApproval(en, people, 3, { id: 3, name: 'Ann' }, false)).toEqual({
      title: 'Delete People #3 "Ann"?',
      body: 'This cannot be undone: the record is removed for good.',
      tone: 'danger',
      approveLabel: 'Delete for good',
      rejectLabel: 'Cancel',
    })
  })
})
