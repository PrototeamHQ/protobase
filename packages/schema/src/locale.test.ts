import { describe, expect, it } from 'vitest'
import { isLocale, pickLocale } from './locale'

describe('pickLocale', () => {
  it('takes the first preferred language the screens come in', () => {
    expect(pickLocale(['de-DE', 'nl-BE', 'en'])).toBe('nl')
  })

  it('reads the language of a tag in any case', () => {
    expect(pickLocale(['NL'])).toBe('nl')
  })

  it('falls back to English', () => {
    expect(pickLocale(['fr-FR'])).toBe('en')
    expect(pickLocale([])).toBe('en')
  })
})

describe('isLocale', () => {
  it('knows only the shipped languages', () => {
    expect(isLocale('nl')).toBe(true)
    expect(isLocale('nl-NL')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})
