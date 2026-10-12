import { describe, expect, it } from 'vitest'
import type { FilterConfig } from './filter-config'
import { activeChips, emptyFilterState, facetLabel, matchesSearch, removeChip, setRange, toggleFacetValue, toggleFlag } from './filter-state'
import { barInRange, fraction, moveThumb } from './range-math'

const config: FilterConfig = {
  facets: [
    { id: 'status', label: 'Status', options: [{ value: 'shipped', label: 'Shipped', count: 3 }] },
    { id: 'place_id', label: 'Place', options: [{ value: '1', label: 'Amsterdam', count: 31 }], combobox: true, labels: { '7': 'Haarlem' } },
  ],
  ranges: [
    { id: 'total', label: 'Total', min: 0, max: 100, step: 1, histogram: [1, 2], format: (value) => `${value}` },
    { id: 'bedrooms', label: 'Bedrooms', min: 0, max: 6, step: 1, histogram: [], format: String },
  ],
  toggles: [{ id: 'unpaid', label: 'Unpaid only' }],
}

describe('filter state', () => {
  it('toggles facet values on and off', () => {
    const on = toggleFacetValue(emptyFilterState, 'status', 'shipped')
    expect(on.facets.status).toEqual(['shipped'])
    expect(toggleFacetValue(on, 'status', 'shipped').facets.status).toEqual([])
  })
  it('sets and clears one range without touching the others', () => {
    const both = setRange(setRange(emptyFilterState, 'total', [10, 50]), 'bedrooms', [2, 4])
    expect(both.ranges).toEqual({ total: [10, 50], bedrooms: [2, 4] })
    expect(setRange(both, 'total', undefined).ranges).toEqual({ bedrooms: [2, 4] })
  })
  it('names facet values by option, then by the known labels, else by the value', () => {
    const place = config.facets[1]!
    expect(facetLabel(place, '1')).toBe('Amsterdam')
    expect(facetLabel(place, '7')).toBe('Haarlem')
    expect(facetLabel(place, '9')).toBe('9')
  })
  it('derives chips and removes them by key', () => {
    const facets = toggleFacetValue(toggleFacetValue(emptyFilterState, 'status', 'shipped'), 'place_id', '7')
    const state = toggleFlag({ ...setRange(setRange(facets, 'total', [10, 50]), 'bedrooms', [2, 3]), date: '30d' }, 'unpaid')
    const chips = activeChips(config, state)
    expect(chips.map((chip) => chip.label)).toEqual(['Status: Shipped', 'Place: Haarlem', 'Total: 10 – 50', 'Bedrooms: 2 – 3', 'Last 30 days', 'Unpaid only'])
    const cleared = chips.reduce((current, chip) => removeChip(current, chip.key), state)
    expect(activeChips(config, cleared)).toEqual([])
  })
  it('rejects unknown chip keys', () => {
    expect(() => removeChip(emptyFilterState, 'nope')).toThrow('Unknown filter chip key')
  })
  it('matches search case-insensitively', () => {
    expect(matchesSearch('Rotterdam', ' rot ')).toBe(true)
    expect(matchesSearch('Rotterdam', 'ams')).toBe(false)
  })
})

describe('range math', () => {
  it('finds bars in range', () => {
    expect(barInRange(0, 4, 0, 100, [30, 60])).toBe(false)
    expect(barInRange(1, 4, 0, 100, [30, 60])).toBe(true)
    expect(barInRange(2, 4, 0, 100, [30, 60])).toBe(true)
  })
  it('computes fractions and ordered thumbs', () => {
    expect(fraction(25, 0, 100)).toBe(0.25)
    expect(moveThumb([20, 40], 0, 70)).toEqual([40, 40])
    expect(moveThumb([20, 40], 1, 5)).toEqual([20, 20])
  })
})
