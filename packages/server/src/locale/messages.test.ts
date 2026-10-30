import { describe, expect, it } from 'vitest'
import { catalogueShape, unknownValues } from '../../../../test-support/icu-catalogue'
import { catalogues, messages } from './messages'

describe('messages', () => {
  const text = messages('assistant/write')

  it('reads the text in the locale asked for', () => {
    expect(text('en')('writeAll')).toBe('Write all')
    expect(text('nl')('writeAll')).toBe('Alles opslaan')
  })

  it('picks the plural form from a count and writes the number for the locale', () => {
    expect(text('en')('batchTitle', { count: 1 })).toBe('Run 1 write in one transaction?')
    expect(text('nl')('batchTitle', { count: 1200 })).toBe('1.200 schrijfacties in één transactie uitvoeren?')
  })
})

describe('the catalogues', () => {
  it('give Dutch exactly the texts English has, naming only values the English text names', () => {
    expect(Object.keys(catalogueShape(catalogues.nl)).sort()).toEqual(Object.keys(catalogueShape(catalogues.en)).sort())
    expect(unknownValues(catalogues.en, catalogues.nl)).toEqual([])
  })
})
