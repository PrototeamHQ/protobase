import { describe, expect, it } from 'vitest'
import { redacted, secretRedactor } from './redact'

describe('redacted', () => {
  it('blanks fields named for a credential, not every name that holds "pass"', () => {
    expect(redacted({ pass: 'a', password: 'b', passphrase: 'c', compass: 'north', bypass: true, apiKey: 'd' })).toEqual({
      pass: '[redacted]',
      password: '[redacted]',
      passphrase: '[redacted]',
      compass: 'north',
      bypass: true,
      apiKey: '[redacted]',
    })
  })
})

describe('secretRedactor', () => {
  it('keeps the value of each key that blanks out the same as another', () => {
    const { value } = secretRedactor(['first-secret', 'second-secret'])
    expect(value({ 'first-secret': 1, 'second-secret': 2 })).toEqual({ '[redacted]': 1, '[redacted] (2)': 2 })
  })
})
