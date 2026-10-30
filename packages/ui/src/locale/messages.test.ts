import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { catalogueShape, unknownValues } from '../../../../test-support/icu-catalogue'
import { setAppLocale, setFallbackLocale } from './active-locale'
import { catalogues, messages } from './messages'

afterEach(() => {
  setFallbackLocale('en')
  setAppLocale(undefined)
})

describe('messages', () => {
  const text = messages('compact-table')

  it('reads the text in the fallback language', () => {
    expect(text('noRows')).toBe('No rows.')
    setFallbackLocale('nl')
    expect(text('noRows')).toBe('Geen rijen.')
  })

  it('picks the plural form from a count, in the language the app sets', () => {
    expect(text('rows', { count: 1 })).toBe('1 row')
    setAppLocale('nl')
    expect(text('rows', { count: 3 })).toBe('3 rijen')
  })

  it('writes a number for the active locale', () => {
    expect(text('rows', { count: 1234 })).toBe('1,234 rows')
    setAppLocale('nl')
    expect(text('rows', { count: 1234 })).toBe('1.234 rijen')
  })

  it('writes a value in lower case where the text says so', () => {
    expect(messages('app/create')('title', { noun: 'Task' })).toBe('New task')
  })

  it('picks a select branch from a boolean', () => {
    expect(messages('app/import')('notDate', { cell: 'x', dayFirst: true })).toBe('x is not a date (2026-04-03 or day/month/year)')
  })

  it('puts React nodes in their places', () => {
    const node = messages('app').rich('staffSignedIn', { staff: createElement('b', null, 'Ann'), user: createElement('b', null, 'Bo'), until: 'noon', reason: 'help' })
    expect(renderToStaticMarkup(createElement('p', null, node))).toBe('<p><b>Ann</b> is signed in as <b>Bo</b> until noon. Reason: help</p>')
  })

  it('fails on a value the text needs but is not given', () => {
    expect(() => text('rows')).toThrow()
  })
})

describe('the catalogues', () => {
  it('give Dutch exactly the texts English has', () => {
    expect(Object.keys(catalogueShape(catalogues.nl)).sort()).toEqual(Object.keys(catalogueShape(catalogues.en)).sort())
  })

  it('name in Dutch only values the English text names, apart from those passed for the translation alone', () => {
    expect(unknownValues(catalogues.en, catalogues.nl)).toEqual(['app/delete.confirmDescription: title'])
  })

  it('use no tag but lower, the only one the lookup fills in', () => {
    const tags = new Set([catalogues.en, catalogues.nl].flatMap((catalogue) => Object.values(catalogueShape(catalogue)).flatMap((shape) => shape.tags)))
    expect([...tags]).toEqual(['lower'])
  })
})
