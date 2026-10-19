import { afterEach, describe, expect, it } from 'vitest'
import { browserLocale, formatTag, setAppLocale, setFallbackLocale } from './active-locale'

afterEach(() => {
  setFallbackLocale('en')
  setAppLocale(undefined)
})

describe('active locale', () => {
  it('writes English numbers and dates as in Britain', () => {
    expect(formatTag()).toBe('en-GB')
  })

  it('writes Dutch numbers and dates as in the Netherlands', () => {
    setAppLocale('nl')
    expect(formatTag()).toBe('nl-NL')
  })

  it('falls back to the fallback once the app sets none', () => {
    setFallbackLocale('nl')
    setAppLocale('en')
    expect(formatTag()).toBe('en-GB')
    setAppLocale(undefined)
    expect(formatTag()).toBe('nl-NL')
  })

  it('takes the browser language when the screens come in it', () => {
    expect(browserLocale(['nl-BE', 'en'])).toBe('nl')
    expect(browserLocale(['fr'])).toBe('en')
  })
})
