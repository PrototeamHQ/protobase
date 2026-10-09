import { describe, expect, it } from 'vitest'
import { enumLabel } from './enum-label'

describe('enumLabel', () => {
  it('reads a labelled value by its label, exactly as given', () => {
    expect(enumLabel('ideal', { ideal: 'iDEAL' })).toBe('iDEAL')
    expect(enumLabel('co_signer', { co_signer: 'Co-signer' })).toBe('Co-signer')
  })

  it('reads any other value as stored', () => {
    expect(enumLabel('direct_debit', { ideal: 'iDEAL' })).toBe('direct_debit')
    expect(enumLabel('co_signer')).toBe('co_signer')
  })
})
