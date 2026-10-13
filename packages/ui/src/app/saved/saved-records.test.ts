import { describe, expect, it } from 'vitest'
import { f, parseFilter, printFilter, resource } from '@protobase/schema'
import { savedFor, savedRecordsOf, savedScope, withoutSaved, withSaved } from './saved-records'

const listings = resource('listings').table('listings').fields({ id: f.integer(), address: f.text() }).primaryKey((r) => r.id).toModel()
const favorites = resource('favorites')
  .table('favorites')
  .fields({ id: f.integer(), user_id: f.text(), listing_id: f.relation('listings').filterable() })
  .primaryKey((r) => r.id)
  .toModel()
const visits = resource('visits').table('visits').fields({ listing_id: f.integer(), day: f.date() }).primaryKey((r) => [r.listing_id, r.day]).toModel()

describe('saved records', () => {
  it('reads the key each saved record points at, plain or labelled', () => {
    const rows = [{ id: 7, listing_id: 12 }, { id: 8, listing_id: { id: 'x-1', name: 'Keizersgracht 1' } }, { id: 9, listing_id: null }]
    expect(savedRecordsOf(favorites, 'listing_id', rows)).toEqual([{ key: '7', target: 12 }, { key: '8', target: 'x-1' }])
  })

  it('finds the saved record of a card by the key the card has', () => {
    const saved = [{ key: '7', target: 12 }]
    expect(savedFor(saved, '12')).toEqual({ key: '7', target: 12 })
    expect(savedFor(saved, '13')).toBeUndefined()
  })

  it('saves and takes off ahead of the server', () => {
    const saved = withSaved([{ key: '7', target: 12 }], 13)
    expect(savedFor(saved, '13')).toEqual({ key: '', target: 13 })
    expect(withoutSaved(saved, '12')).toEqual([{ key: '', target: 13 }])
  })

  it('filters the target records to the saved ones, nothing to filter on when none are', () => {
    const scope = savedScope(listings, [{ key: '7', target: 12 }, { key: '8', target: 3 }, { key: '9', target: 12 }])
    expect(printFilter(scope!)).toBe('in(id, 12, 3)')
    expect(parseFilter(`${printFilter(scope!)} AND address = "Dam 1"`).ok).toBe(true)
    expect(savedScope(listings, [])).toBeUndefined()
    expect(() => savedScope(visits, [])).toThrow('visits has a composite key')
  })
})
