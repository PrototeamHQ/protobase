import { describe, expect, it } from 'vitest'
import { localeSetting } from './locale-option'

describe('localeSetting', () => {
  it('passes a shipped language', () => {
    expect(localeSetting('nl')).toBe('nl')
  })

  it('leaves an unset option unset', () => {
    expect(localeSetting(undefined)).toBeUndefined()
  })

  it('refuses a language the screens do not come in', () => {
    expect(() => localeSetting('nl-NL')).toThrow(`options.locale is "nl-NL": use one of 'en', 'nl'`)
  })
})
