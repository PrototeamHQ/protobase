import { describe, expect, it } from 'vitest'
import { offChoice } from './off-choice'

describe('--off', () => {
  it('takes keep, archive or delete, and nothing when not given', () => {
    expect(offChoice('keep')).toBe('keep')
    expect(offChoice('archive')).toBe('archive')
    expect(offChoice(undefined)).toBeUndefined()
  })

  it('refuses anything else, naming the choices', () => {
    expect(() => offChoice('drop')).toThrow('--off takes keep, archive, delete, not "drop"')
  })
})
