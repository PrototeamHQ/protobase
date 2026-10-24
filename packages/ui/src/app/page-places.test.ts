import { describe, expect, it } from 'vitest'
import { createPagePlaces } from './page-places'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) }
}

describe('page places', () => {
  it('starts an entry never left at the top', () => {
    expect(createPagePlaces(memory()).placeOf('a')).toBe(0)
  })

  it('brings each history entry back to where it was left', () => {
    const places = createPagePlaces(memory())
    places.save('a', 700)
    places.save('b', 40.6)
    expect(places.placeOf('a')).toBe(700)
    expect(places.placeOf('b')).toBe(41)
  })

  it('keeps a page pulled past its top at the top', () => {
    const places = createPagePlaces(memory())
    places.save('a', -30)
    expect(places.placeOf('a')).toBe(0)
  })

  it('outlasts a reload once persisted', () => {
    const storage = memory()
    const places = createPagePlaces(storage)
    places.save('a', 120)
    expect(createPagePlaces(storage).placeOf('a')).toBe(0)
    places.persist()
    expect(createPagePlaces(storage).placeOf('a')).toBe(120)
  })

  it('keeps only the most recent places', () => {
    const storage = memory()
    const places = createPagePlaces(storage)
    for (let entry = 0; entry < 60; entry++) places.save(String(entry), entry + 1)
    places.save('10', 11)
    places.persist()
    const reloaded = createPagePlaces(storage)
    expect(reloaded.placeOf('9')).toBe(0)
    expect(reloaded.placeOf('10')).toBe(11)
    expect(reloaded.placeOf('59')).toBe(60)
    expect((JSON.parse(storage.getItem('protobase:page-places')!) as unknown[]).length).toBe(50)
  })

  it('ignores what it did not write, and unavailable storage', () => {
    const storage = memory()
    storage.setItem('protobase:page-places', JSON.stringify([['a', 'far'], ['b'], { entry: 'c' }]))
    expect(createPagePlaces(storage).placeOf('a')).toBe(0)
    const blocked = { getItem: () => { throw new DOMException('blocked', 'SecurityError') }, setItem: () => { throw new DOMException('full', 'QuotaExceededError') } }
    const places = createPagePlaces(blocked)
    places.save('a', 3)
    places.persist()
    expect(places.placeOf('a')).toBe(3)
  })
})
