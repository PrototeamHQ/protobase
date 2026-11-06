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

  it('blanks a token it is given as written and URL-encoded, and one without a URL encoding as written', () => {
    const { add, text } = secretRedactor([])
    add('ya29.a0/Token+part==')
    expect(text('Bearer ya29.a0/Token+part== and ?token=ya29.a0%2FToken%2Bpart%3D%3D')).toBe('Bearer [redacted] and ?token=[redacted]')
    add('lone-\ud800-surrogate')
    expect(text('got lone-\ud800-surrogate')).toBe('got [redacted]')
  })
})
