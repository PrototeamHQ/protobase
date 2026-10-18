import { describe, expect, it } from 'vitest'
import { cellText } from './cell-text'
import type { ColumnSpec } from './column-spec'

const spec = (kind: ColumnSpec['kind'], extra: Partial<ColumnSpec> = {}): ColumnSpec => ({ id: 'value', header: 'Value', kind, width: 100, ...extra })

describe('cellText', () => {
  it("shows a status by its label", () => {
    expect(cellText(spec('status', { labels: { on_hold: 'On hold' } }), 'on_hold')).toBe('On hold')
  })

  it('shows a relation by the related name', () => {
    expect(cellText(spec('relation'), { id: 7, name: 'Nordlicht' })).toBe('Nordlicht')
  })

  it('shows money as its formatted amount with its suffix', () => {
    expect(cellText(spec('money', { currency: 'EUR', suffix: ' /month' }), 123456)).toBe('€1,234.56 /month')
  })

  it('shows a missing value as a dash', () => {
    expect(cellText(spec('text'), null)).toBe('—')
    expect(cellText(spec('money'), undefined)).toBe('—')
  })

  it('has no text for a ticked boolean, which shows a check', () => {
    expect(cellText(spec('boolean'), true)).toBeUndefined()
    expect(cellText(spec('boolean'), false)).toBe('No')
  })
})
