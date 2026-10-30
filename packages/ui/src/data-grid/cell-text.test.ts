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
    expect(cellText(spec('money', { currency: 'USD' }), 5000)).toMatch(/\$50\.00$/)
  })

  it('refuses money without a currency rather than guess one', () => {
    expect(() => cellText(spec('money'), 5000)).toThrow('Money column "value" has no currency')
  })

  it('shows a number and a signed number with their prefix and suffix', () => {
    expect(cellText(spec('number', { prefix: '€', suffix: ' net' }), 1200)).toBe('€1,200 net')
    expect(cellText(spec('signed', { suffix: ' pcs' }), -5)).toBe('−5 pcs')
  })

  it('shows a relative datetime as how long ago', () => {
    expect(cellText(spec('datetime', { relative: true }), Date.now() - 300_000)).toBe('5 minutes ago')
  })

  it('shows a user by the name its lookup gives, an unknown id as itself', () => {
    const users = (id: string) => (id === 'u1' ? { name: 'Sanne M.', initials: 'SM', hue: 250 } : undefined)
    expect(cellText(spec('user', { users }), 'u1')).toBe('Sanne M.')
    expect(cellText(spec('user', { users }), 'u9')).toBe('u9')
    expect(cellText(spec('user'), 'u1')).toBe('u1')
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
