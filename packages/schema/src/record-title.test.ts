import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel, ViewModel } from './model'
import { labelFieldOf, recordTitle, recordTitleField } from './record-title'

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
  it('never picks a sensitive or write-only text field, which no record carries, even one named like a label', () => {
    const sealed = { ...field('sealed', 'text'), sensitive: true, writeOnly: true } as FieldModel
    expect(labelFieldOf({ ...model, fields: { id: field('id', 'bigint'), sealed } } as unknown as ResourceModel)).toBe('id')
    const code = { ...field('code', 'text'), sensitive: true, writeOnly: true } as FieldModel
    const secretName = { ...field('name', 'text'), sensitive: true } as FieldModel
    const named = { ...model, fields: { id: field('id', 'bigint'), name: secretName, code, label: field('label', 'text') } } as unknown as ResourceModel
    expect(labelFieldOf(named)).toBe('label')
    expect(recordTitleField(named, undefined)).toBe('label')
  })
  it('reads the title field\'s value, an enum by its label, and the fallback when it is missing', () => {
    const view = { title: 'status', fields: { status: { valueLabels: { in_flight: 'In flight' } } } } as unknown as ViewModel
    expect(recordTitle(model, view, { status: 'in_flight' }, '7')).toBe('In flight')
    expect(recordTitle(model, undefined, { number: 'INV-1' }, '7')).toBe('INV-1')
    expect(recordTitle(model, undefined, {}, '7')).toBe('7')
  })
})
