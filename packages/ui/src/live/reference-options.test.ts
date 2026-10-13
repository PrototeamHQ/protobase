import { describe, expect, it } from 'vitest'
import { labelKeys, matchOptions } from './reference-options'

describe('matchOptions', () => {
  it('lists the matches in their order, with the counts the facets know', () => {
    const counted = [{ value: '1', label: 'Amsterdam', count: 31 }, { value: '22', label: 'Hilversum', count: 5 }]
    expect(matchOptions([['22', 'Hilversum'], ['40', 'Hoorn']], counted)).toEqual([{ value: '22', label: 'Hilversum', count: 5 }, { value: '40', label: 'Hoorn' }])
  })
})

describe('labelKeys', () => {
  it('names the chosen values outside the counted ones, once each', () => {
    expect(labelKeys(['1', '23'], ['23', '40', '40'])).toEqual(['40'])
  })
})
