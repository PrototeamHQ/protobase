import { describe, expect, it } from 'vitest'
import type { FilterConfig, FilterState } from './filter-config'
import { activeChips } from './filter-state'
import { activeFilterKeys, barFilters, mergeKeys } from './secondary-filters'

const range = (id: string, secondary?: boolean) => ({ id, label: id, min: 0, max: 10, step: 1, histogram: [], format: String, secondary })
const config: FilterConfig = {
  facets: [
    { id: 'status', label: 'Status', options: [] },
    { id: 'agent', label: 'Agent', options: [], secondary: true },
  ],
  ranges: [range('price'), range('area', true)],
  datePresets: true,
  dateSecondary: true,
  toggles: [
    { id: 'garden', label: 'Garden' },
    { id: 'pool', label: 'Pool', secondary: true },
  ],
}

describe('activeFilterKeys', () => {
  it('gives one key per active filter', () => {
    const state: FilterState = { facets: { agent: ['a', 'b'] }, ranges: { area: [1, 2] }, date: '7d', toggles: ['pool'] }
    expect(activeFilterKeys(activeChips(config, state))).toEqual(['facet:agent', 'range:area', 'date', 'toggle:pool'])
  })
})

describe('mergeKeys', () => {
  it('returns the same array when nothing is new', () => {
    const revealed = ['a', 'b']
    expect(mergeKeys(revealed, ['b'])).toBe(revealed)
  })

  it('appends only the new keys', () => {
    expect(mergeKeys(['a'], ['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('barFilters', () => {
  it('always shows a filter that is not secondary', () => {
    const { shown, more } = barFilters(config, [])
    expect([...shown]).toEqual(['facet:status', 'range:price', 'toggle:garden'])
    expect(more.map((item) => item.key)).not.toContain('facet:status')
  })

  it('keeps unrevealed secondary filters in the menu, in the order the bar draws them', () => {
    expect(barFilters(config, []).more).toEqual([
      { key: 'facet:agent', label: 'Agent' },
      { key: 'range:area', label: 'area' },
      { key: 'date', label: 'Date' },
      { key: 'toggle:pool', label: 'Pool' },
    ])
  })

  it('shows a revealed secondary filter and drops it from the menu', () => {
    const { shown, more } = barFilters(config, ['date', 'facet:agent'])
    expect(shown.has('date') && shown.has('facet:agent')).toBe(true)
    expect(more.map((item) => item.key)).toEqual(['range:area', 'toggle:pool'])
  })
})
