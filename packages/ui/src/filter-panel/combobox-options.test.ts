import { describe, expect, it } from 'vitest'
import type { FacetGroupConfig } from './filter-config'
import { comboboxOptions, moveActive } from './combobox-options'

const places: FacetGroupConfig = {
  id: 'place_id',
  label: 'Place',
  combobox: true,
  options: [
    { value: '1', label: 'Amsterdam', count: 31 },
    { value: '23', label: 'Madrid', count: 27 },
    { value: '7', label: 'Haarlem', count: 14 },
  ],
}

describe('comboboxOptions', () => {
  it('filters the options by name when the group does not search itself', () => {
    expect(comboboxOptions(places, 'AM').map((option) => option.label)).toEqual(['Amsterdam'])
    expect(comboboxOptions(places, '')).toHaveLength(3)
  })
  it('lists the options as given when the group searches itself, as they are the matches already', () => {
    expect(comboboxOptions({ ...places, onSearch: () => {} }, 'zzz')).toHaveLength(3)
  })
})

describe('moveActive', () => {
  it('starts at the first option going down and the last going up', () => {
    expect(moveActive(-1, 3, 'ArrowDown')).toBe(0)
    expect(moveActive(-1, 3, 'ArrowUp')).toBe(2)
  })
  it('wraps around at either end', () => {
    expect(moveActive(2, 3, 'ArrowDown')).toBe(0)
    expect(moveActive(0, 3, 'ArrowUp')).toBe(2)
    expect(moveActive(1, 3, 'ArrowDown')).toBe(2)
  })
  it('has no active option without options', () => {
    expect(moveActive(0, 0, 'ArrowDown')).toBe(-1)
  })
})
