import { describe, expect, it } from 'vitest'
import { localeDecimal } from './number-text'

describe('localeDecimal', () => {
  it("names the decimal separator a language writes", () => {
    expect(localeDecimal('nl-NL')).toBe(',')
    expect(localeDecimal('de-DE')).toBe(',')
    expect(localeDecimal('en-GB')).toBe('.')
    expect(localeDecimal('en-US')).toBe('.')
  })
})
