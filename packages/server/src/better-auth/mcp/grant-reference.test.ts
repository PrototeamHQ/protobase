import { describe, expect, it } from 'vitest'
import { grantReference, readGrantReference } from './grant-reference'

describe('the grant a consent is made for', () => {
  it('reads back what it wrote, whatever the order given', () => {
    const reference = grantReference({ role: 'sales', organization: 'acme & co' })
    expect(reference).toBe(grantReference({ organization: 'acme & co', role: 'sales' }))
    expect(readGrantReference(reference)).toEqual({ role: 'sales', organization: 'acme & co' })
  })

  it('leaves out missing values', () => {
    expect(grantReference({ role: 'sales' })).toBe('role=sales')
    expect(grantReference({ role: '', organization: undefined })).toBe('')
    expect(readGrantReference('role=sales')).toEqual({ role: 'sales' })
  })

  it('holds nothing for a missing or empty reference', () => {
    expect(readGrantReference(undefined)).toEqual({})
    expect(readGrantReference(null)).toEqual({})
    expect(readGrantReference('')).toEqual({})
  })
})
