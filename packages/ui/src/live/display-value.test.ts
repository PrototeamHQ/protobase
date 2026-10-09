import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { displayValue } from './display-value'

const field = (type: FieldModel['type']) => ({ name: 'x', column: 'x', type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [] }) as FieldModel

describe('displayValue', () => {
  it('formats money with prefix and decimals', () => {
    expect(displayValue(field('decimal'), '1234.5', { prefix: '€', decimals: 2 })).toBe('€1,234.50')
  })
  it('formats percentages, booleans and enums', () => {
    expect(displayValue(field('decimal'), '5.00', { format: 'percent' })).toBe('5%')
    expect(displayValue(field('boolean'), true)).toBe('Yes')
    expect(displayValue(field('enum'), 'shipped')).toBe('shipped')
  })
  it("shows an enum value by the view's label, else as stored", () => {
    expect(displayValue(field('enum'), 'ideal', { valueLabels: { ideal: 'iDEAL' } })).toBe('iDEAL')
    expect(displayValue(field('enum'), 'bank_transfer', { valueLabels: { ideal: 'iDEAL' } })).toBe('bank_transfer')
  })
  it('formats dates in UTC and shows a dash for nothing', () => {
    expect(displayValue(field('timestamp'), '2026-10-06T09:41:00.000Z')).toBe('6 Oct 2026, 09:41')
    expect(displayValue(field('date'), '2026-10-06')).toBe('6 Oct 2026')
    expect(displayValue(field('text'), null)).toBe('—')
  })
})
