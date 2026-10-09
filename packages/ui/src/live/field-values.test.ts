import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { differs, isEditable, toDraft, toPatchValue } from './field-values'

const field = (type: FieldModel['type'], extra: Partial<FieldModel> = {}) =>
  ({ name: 'x', column: 'x', type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra }) as FieldModel

describe('field values', () => {
  it('turns stored values into draft text', () => {
    expect(toDraft(null)).toBe('')
    expect(toDraft('12.50')).toBe('12.50')
    expect(toDraft(7)).toBe('7')
  })

  it('sends integers as numbers and decimals as text', () => {
    expect(toPatchValue(field('integer'), '12')).toBe(12)
    expect(toPatchValue(field('decimal'), ' 12.50 ')).toBe('12.50')
    expect(toPatchValue(field('boolean'), true)).toBe(true)
  })

  it('sends null for an emptied optional field', () => {
    expect(toPatchValue(field('text', { nullable: true }), '')).toBeNull()
    expect(toPatchValue(field('text'), '')).toBe('')
  })

  it('compares decimals by value', () => {
    expect(differs(field('decimal'), '12.5', '12.50')).toBe(false)
    expect(differs(field('decimal'), '12.6', '12.50')).toBe(true)
    expect(differs(field('text'), 'a', 'a')).toBe(false)
  })

  it('does not edit read-only, key and structured fields', () => {
    expect(isEditable(field('text'))).toBe(true)
    expect(isEditable(field('text', { readOnly: true }))).toBe(false)
    expect(isEditable(field('relation'))).toBe(false)
    expect(isEditable(field('json'))).toBe(false)
  })
})
