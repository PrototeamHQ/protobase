import type { ResourceModel } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { recordFields } from './record-fields'

const model = { name: 'tasks', fields: { id: { name: 'id' }, title: { name: 'title' }, secret: { name: 'secret' } } } as unknown as ResourceModel
const record = { id: 1, title: 'Ship' }

describe('recordFields', () => {
  it('keeps the fields named, in their order', () => {
    expect(recordFields(model, record, ['title', 'id'])).toEqual({ title: 'Ship', id: 1 })
  })

  it('keeps the whole record without fields', () => {
    expect(recordFields(model, record, undefined)).toBe(record)
  })

  it('refuses a field the record does not hold, as one the caller may not read', () => {
    expect(() => recordFields(model, record, ['secret'])).toThrow('Unknown fields: secret')
  })
})
