import { describe, expect, it } from 'vitest'
import { hasLocale, quoteIdentifier } from './postgres'

describe('hasLocale', () => {
  it('finds the locale in either spelling', () => {
    expect(hasLocale('C\nen_US.UTF-8\n')).toBe(true)
    expect(hasLocale('C.utf8\nen_US.utf8\n')).toBe(true)
  })

  it('reports a missing locale', () => {
    expect(hasLocale('C\nPOSIX\nC.utf8\n')).toBe(false)
  })
})

describe('quoteIdentifier', () => {
  it('quotes a dotted name as one identifier', () => {
    expect(quoteIdentifier('team.dev')).toBe('"team.dev"')
  })

  it('doubles double quotes inside the name', () => {
    expect(quoteIdentifier('team"dev')).toBe('"team""dev"')
  })
})
