import { describe, expect, it } from 'vitest'
import { can, fieldAccess, rowAllows } from './permissions'

describe('can', () => {
  it('offers what is allowed', () => {
    expect(can({ create: true, update: false, delete: false, conditional: [] }, 'create')).toBe(true)
  })
  it('hides what is denied', () => {
    expect(can({ create: true, update: false, delete: false, conditional: [] }, 'delete')).toBe(false)
  })
  it('keeps what depends on the record', () => {
    expect(can({ create: true, update: true, delete: false, conditional: ['delete'] }, 'delete')).toBe(true)
  })
})

describe('rowAllows', () => {
  it('follows the row, and allows a row that carries nothing', () => {
    expect(rowAllows({ permissions: { update: true, delete: false } }, 'delete')).toBe(false)
    expect(rowAllows({ permissions: { update: true, delete: false } }, 'update')).toBe(true)
    expect(rowAllows({}, 'delete')).toBe(true)
  })
})

describe('fieldAccess', () => {
  const permissions = { update: true, delete: true, fields: { number: 'edit', total: 'read' } } as const
  it('reads the mode of each field and hides the ones not listed', () => {
    expect(fieldAccess(permissions, 'number')).toBe('edit')
    expect(fieldAccess(permissions, 'total')).toBe('read')
    expect(fieldAccess(permissions, 'unitCost')).toBe('hidden')
  })
  it('leaves it to the model when the record carries no modes', () => {
    expect(fieldAccess(undefined, 'unitCost')).toBe('edit')
  })
})
