import { describe, expect, it } from 'vitest'
import type { ResourceModel } from './model'
import { matchedSearchField, matchesSearch, searchTerms } from './search-match'

const model = { search: ['name', 'team', 'note', 'phone'], searchMatch: { phone: 'digitsEnd' } } as unknown as ResourceModel
const portfolio = { name: 'Portfolio', team: 'Web Platform', note: null, phone: '+31 6 47069623' }
const found = (text: string) => matchesSearch(model, portfolio, text)

describe('matchesSearch', () => {
  it('matches part of a word anywhere, ignoring case', () => {
    expect([found('Port'), found('folio'), found('PORTFOLIO')]).toEqual([true, true, true])
  })

  it('needs every word, each in any of the fields', () => {
    expect(found('port web')).toBe(true)
    expect(found('port service')).toBe(false)
  })

  it('takes wildcards literally and matches nothing without words', () => {
    expect([found('p%o'), found('   '), found('null')]).toEqual([false, false, false])
  })

  it('matches a digitsEnd field only at the end of its digits, however the number is written', () => {
    expect([found('9623'), found('47069623'), found('+31 6 47069623'), found('6-4706-9623')]).toEqual([true, true, true, true])
    expect([found('+316'), found('4706'), found('31 6 4706'), found('x9623')]).toEqual([false, false, false, false])
  })
})

describe('searchTerms', () => {
  it('adds the whole text first when it is a phone number of several words', () => {
    expect(searchTerms('+31 6 4706').map((term) => [term.text, term.digits, term.whole])).toEqual([
      ['+31 6 4706', '3164706', true],
      ['+31', '31', false],
      ['6', '6', false],
      ['4706', '4706', false],
    ])
    expect(searchTerms('jan 9623').map((term) => term.digits)).toEqual(['', '9623'])
  })
})

describe('matchedSearchField', () => {
  const shown = ['name', 'team']

  it('is nothing when the shown fields explain the match', () => {
    expect(matchedSearchField(model, portfolio, 'port web', shown)).toBeUndefined()
  })

  it('is the search field that matched a word the shown fields do not have', () => {
    expect(matchedSearchField(model, portfolio, '9623', shown)).toBe('phone')
    expect(matchedSearchField(model, portfolio, 'port 9623', shown)).toBe('phone')
    expect(matchedSearchField(model, portfolio, '+31 6 47069623', shown)).toBe('phone')
    expect(matchedSearchField(model, { ...portfolio, note: 'Port of call' }, 'call', shown)).toBe('note')
  })
})
