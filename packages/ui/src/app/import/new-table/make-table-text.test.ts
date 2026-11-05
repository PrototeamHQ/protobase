import { afterEach, describe, expect, it } from 'vitest'
import { setAppLocale } from '../../../locale/active-locale'
import { text } from '../messages'

afterEach(() => setAppLocale(undefined))

describe('the make table button', () => {
  it('says how many rows the table gets, in every language', () => {
    expect(text('makeTable', { rows: 1 })).toBe('Make table with 1 row')
    expect(text('makeTable', { rows: 1234 })).toBe('Make table with 1,234 rows')
    setAppLocale('nl')
    expect(text('makeTable', { rows: 2 })).toBe('Tabel maken met 2 rijen')
  })
})
