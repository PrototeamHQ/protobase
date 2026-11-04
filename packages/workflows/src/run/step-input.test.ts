import { describe, expect, it } from 'vitest'
import { innerScope } from './step-input'

describe('innerScope', () => {
  it('keeps the scopes of differently named Maps apart, whatever their names hold', () => {
    expect(innerScope('', 'Each', 3, 0)).toBe('Each.3[0]')
    expect(innerScope('A.1[0]', 'B', 2, 0)).not.toBe(innerScope('', 'A.1[0]/B', 2, 0))
  })
})
