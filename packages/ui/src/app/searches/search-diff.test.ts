import { describe, expect, it } from 'vitest'
import { checkFilter, evaluateFilter, f, parseFilter, resource } from '@protobase/schema'
import { addedFilter, filterChanges, netChange, removedFilter } from './search-diff'

const homes = resource('homes')
  .table('homes')
  .fields({ id: f.integer().filterable(), rent: f.decimal({ precision: 10, scale: 2 }).optional().filterable(), garden: f.boolean().optional().filterable() })
  .primaryKey((r) => r.id)
  .toModel()

const rows = [
  { id: 1, rent: 1500, garden: true },
  { id: 2, rent: 2500, garden: true },
  { id: 3, rent: 1200, garden: false },
  { id: 4, rent: null, garden: true },
  { id: 5, rent: 1800, garden: null },
]

const found = (text: string | null) => {
  if (text === null) return []
  const parsed = parseFilter(text)
  if (!parsed.ok || !parsed.ast) throw new Error(`Not a filter: ${text}`)
  const checked = checkFilter(homes, parsed.ast)
  if (!checked.ok) throw new Error(`Not a filter of homes: ${text}`)
  return rows.filter((row) => evaluateFilter(checked.filter, row)).map((row) => row.id)
}

describe('addedFilter and removedFilter', () => {
  it('find the records the new filter adds and the ones it drops, through the list API', () => {
    const before = 'rent >= 1000 AND rent <= 2000'
    const after = 'garden = true'
    expect(addedFilter(before, after)).toBe('garden = true AND NOT ((rent >= 1000 AND rent:*) AND (rent <= 2000 AND rent:*))')
    expect(removedFilter(before, after)).toBe('(rent >= 1000 AND rent <= 2000) AND NOT (garden = true AND garden:*)')
    expect(found(addedFilter(before, after))).toEqual([2, 4])
    expect(found(removedFilter(before, after))).toEqual([3, 5])
  })

  it('count a record the old filter cannot decide, for a field without a value, as not found by it', () => {
    // The database leaves `NOT rent >= 1000` unknown for a home without a rent; each condition is guarded by rent:*
    expect(addedFilter('rent >= 1000', 'garden = true')).toBe('garden = true AND NOT (rent >= 1000 AND rent:*)')
  })

  it('negate a NOT inside a filter with its own guard', () => {
    expect(addedFilter('NOT garden = true', 'rent < 2000')).toBe('rent < 2000 AND NOT (NOT garden = true AND garden:*)')
    // Home 5 has no garden value, so the database's `NOT garden = true` does not find it either: it is added
    expect(found(addedFilter('NOT garden = true', 'rent < 2000'))).toEqual([1, 5])
    expect(addedFilter('garden = true OR isNull(rent)', 'rent < 2000')).toBe('rent < 2000 AND NOT ((garden = true AND garden:*) OR isNull(rent))')
  })

  it('add nothing when the old filter finds every record, and drop everything outside the new one when the new finds every record', () => {
    expect(addedFilter('', 'garden = true')).toBeNull()
    expect(removedFilter('garden = true', '')).toBeNull()
    expect(found(removedFilter('', 'garden = true'))).toEqual([3, 5])
  })

  it('throw on a filter it cannot read', () => {
    expect(() => addedFilter('rent >=', 'garden = true')).toThrow('The filter cannot be read')
  })
})

describe('filterChanges', () => {
  it('names the chips removed, changed and added, matching a condition no widget holds by what it says', () => {
    const before = [
      { key: 'facet:place_id:1', label: 'Place: Amsterdam' },
      { key: 'range:rent', label: 'Rent: €1,000 – €2,000' },
      { key: 'extra:0', label: '"canal"' },
    ]
    const after = [
      { key: 'extra:0', label: 'address = "Keizersgracht"' },
      { key: 'range:rent', label: 'Rent: €1,000 – €2,500' },
      { key: 'toggle:garden', label: 'Garden' },
      { key: 'extra:1', label: '"canal"' },
    ]
    expect(filterChanges(before, after)).toEqual([
      { kind: 'removed', label: 'Place: Amsterdam' },
      { kind: 'changed', label: 'Rent: €1,000 – €2,500', before: 'Rent: €1,000 – €2,000' },
      { kind: 'added', label: 'address = "Keizersgracht"' },
      { kind: 'added', label: 'Garden' },
    ])
  })

  it('finds no change between the same chips in another order', () => {
    const chips = [
      { key: 'toggle:garden', label: 'Garden' },
      { key: 'range:rent', label: 'Rent: €1,000 – €2,000' },
    ]
    expect(filterChanges(chips, [...chips].reverse())).toEqual([])
  })
})

describe('netChange', () => {
  it('says how many more or fewer records a search finds', () => {
    expect(netChange(7, 2, 'home', 'homes')).toBe('5 more homes')
    expect(netChange(0, 1, 'home', 'homes')).toBe('1 fewer home')
    expect(netChange(3, 3, 'home', 'homes')).toBe('As many homes')
  })
})
