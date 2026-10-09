import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { labelFieldOf, recordTitleField } from './model-helpers'

const field = (name: string, type: FieldModel['type']) => ({ name, type }) as FieldModel
const model = { name: 'invoices', primaryKey: ['id'], fields: { id: field('id', 'bigint'), status: field('status', 'enum'), number: field('number', 'text'), notes: field('notes', 'text') } } as unknown as ResourceModel

describe('record titles', () => {
  it('uses the first text column of the view list', () => {
    const view = { list: { columns: ['status', 'notes', 'number'] } } as unknown as ViewModel
    expect(recordTitleField(model, view)).toBe('notes')
  })
  it('falls back to a name-like field, then to the key', () => {
    expect(recordTitleField(model, undefined)).toBe('number')
    expect(labelFieldOf({ ...model, fields: { id: field('id', 'bigint') } } as unknown as ResourceModel)).toBe('id')
  })
})
