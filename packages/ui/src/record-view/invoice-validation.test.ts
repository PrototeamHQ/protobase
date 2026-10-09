import { describe, expect, it } from 'vitest'
import { toIsoDay, validateInvoice } from './invoice-validation'

const valid = { issuedAt: '2026-10-01', dueAt: '2026-10-31', reference: 'PO-48213' }

describe('validateInvoice', () => {
  it('accepts a valid invoice', () => {
    expect(validateInvoice(valid)).toEqual({})
  })
  it('rejects a due date before the issue date', () => {
    expect(validateInvoice({ ...valid, dueAt: '2026-09-01' }).dueAt).toMatch(/before/)
  })
  it('rejects malformed dates and references', () => {
    expect(validateInvoice({ ...valid, issuedAt: '1 Oct' }).issuedAt).toBeDefined()
    expect(validateInvoice({ ...valid, reference: 'abc' }).reference).toBeDefined()
  })
  it('allows an empty reference', () => {
    expect(validateInvoice({ ...valid, reference: '' })).toEqual({})
  })
})

describe('toIsoDay', () => {
  it('formats UTC days', () => {
    expect(toIsoDay(Date.UTC(2026, 9, 6, 23, 59))).toBe('2026-10-06')
  })
})
