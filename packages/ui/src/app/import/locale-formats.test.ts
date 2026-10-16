import { describe, expect, it } from 'vitest'
import { localeFormats } from './locale-formats'

describe('localeFormats', () => {
  it('starts from the locale\'s decimal separator and order of day and month', () => {
    expect(localeFormats('en-US')).toEqual({ decimal: '.', dateOrder: 'mdy' })
    expect(localeFormats('nl-NL')).toEqual({ decimal: ',', dateOrder: 'dmy' })
    expect(localeFormats('en-GB')).toEqual({ decimal: '.', dateOrder: 'dmy' })
  })
})
