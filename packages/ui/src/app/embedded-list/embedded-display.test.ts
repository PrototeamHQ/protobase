import { describe, expect, it } from 'vitest'
import { appPath, f, resource, view } from '@protobase/schema'
import { embeddedDisplay, embeddedDisplayKey, readPickedDisplay, viewAllAddress, writePickedDisplay } from './embedded-display'

const listings = resource('listings')
  .table('listings')
  .fields({ id: f.integer(), address: f.text().sortable(), publishedAt: f.timestamp().sortable(), price: f.integer() })
  .primaryKey((r) => r.id)
const model = listings.toModel()
const withCards = view<typeof listings>('listings')
  .list((r, d) => ({ columns: [r.address, r.price], sort: [[r.publishedAt, 'desc']], displays: [d.cards({ meta: [r.price] })] }))
  .toModel()
const tableOnly = view<typeof listings>('listings').list((r) => ({ columns: [r.address] })).toModel()

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) }
}

describe('embeddedDisplay', () => {
  it('opens the view default on a desktop, the display the page names instead of it, and cards on a phone', () => {
    expect(embeddedDisplay(withCards, false, {})).toBe('table')
    expect(embeddedDisplay(withCards, false, { preferred: 'cards' })).toBe('cards')
    expect(embeddedDisplay(withCards, true, {})).toBe('cards')
    expect(embeddedDisplay(withCards, true, { preferred: 'table' })).toBe('cards')
  })

  it('keeps the table for a view without cards, and skips names the view does not have', () => {
    expect(embeddedDisplay(tableOnly, true, {})).toBe('table')
    expect(embeddedDisplay(tableOnly, false, { preferred: 'cards', picked: 'cards' })).toBe('table')
    expect(embeddedDisplay(withCards, false, { preferred: 'map' })).toBe('table')
  })

  it("opens the viewer's pick over every default, on any screen", () => {
    expect(embeddedDisplay(withCards, true, { picked: 'table' })).toBe('table')
    expect(embeddedDisplay(withCards, false, { picked: 'cards', preferred: 'table' })).toBe('cards')
  })
})

describe('picked display in storage', () => {
  it('keeps a pick per place and reads it back', () => {
    const storage = memory()
    writePickedDisplay(storage, embeddedDisplayKey('page:listings:Newest listings'), 'cards')
    expect(readPickedDisplay(storage, 'protobase:embedded-display:page:listings:Newest listings')).toBe('cards')
    expect(readPickedDisplay(storage, embeddedDisplayKey('related:places:Listings'))).toBeUndefined()
  })

  it('treats unavailable storage as no pick', () => {
    const blocked = { getItem: () => { throw new DOMException('blocked', 'SecurityError') }, setItem: () => { throw new DOMException('blocked', 'SecurityError') } }
    expect(readPickedDisplay(blocked, 'k')).toBeUndefined()
    expect(() => writePickedDisplay(blocked, 'k', 'cards')).not.toThrow()
  })
})

describe('viewAllAddress', () => {
  it('opens the list with the same filter and order, leaving out the defaults for the screen', () => {
    const address = viewAllAddress(model, withCards, false, { filter: 'price > 100', orderBy: 'address asc', display: 'cards' })
    expect(address).toEqual({ kind: 'list', resource: 'listings', filter: 'price > 100', orderBy: 'address asc', display: 'cards' })
    expect(appPath(viewAllAddress(model, withCards, false, { filter: '', orderBy: 'publishedAt desc', display: 'table' }))).toBe('/listings')
    expect(viewAllAddress(model, withCards, true, { filter: '', orderBy: 'publishedAt desc', display: 'cards' })).toEqual({ kind: 'list', resource: 'listings' })
  })
})
