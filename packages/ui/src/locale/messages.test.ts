import { afterEach, describe, expect, it } from 'vitest'
import { setAppLocale, setFallbackLocale } from './active-locale'
import { defineMessages } from './messages'

const text = defineMessages({
  en: { search: 'Search', rows: (count: number) => `${count} rows` },
  nl: { search: 'Zoeken', rows: (count: number) => `${count} rijen` },
})

afterEach(() => {
  setFallbackLocale('en')
  setAppLocale(undefined)
})

describe('defineMessages', () => {
  it('reads the text in the fallback language', () => {
    expect(text('search')).toBe('Search')
    setFallbackLocale('nl')
    expect(text('search')).toBe('Zoeken')
  })

  it('reads the language the app sets over the fallback', () => {
    setAppLocale('nl')
    expect(text('rows', 3)).toBe('3 rijen')
  })
})
