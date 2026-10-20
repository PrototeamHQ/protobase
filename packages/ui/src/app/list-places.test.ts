import { describe, expect, it } from 'vitest'
import { createListPlaces } from './list-places'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) }
}

describe('list places', () => {
  it('starts a list at the top when it has never been anywhere', () => {
    expect(createListPlaces(memory()).placeOf('a', '/tasks?')).toBe(0)
  })

  it('brings a history entry back to where its list was', () => {
    const places = createListPlaces(memory())
    places.save('a', '/tasks?', 700.25)
    places.save('b', '/tasks?', 40)
    expect(places.placeOf('a', '/tasks?')).toBe(700.25)
  })

  it('starts a new entry of the same list where it last was', () => {
    const places = createListPlaces(memory())
    places.save('a', '/tasks?', 700.25)
    places.save('b', '/tasks?', 40)
    expect(places.placeOf('c', '/tasks?')).toBe(40)
  })

  it('starts another sort or filter of the list at the top', () => {
    const places = createListPlaces(memory())
    places.save('a', '/tasks?', 700.25)
    expect(places.placeOf('a', '/tasks?orderBy=title')).toBe(0)
  })

  it('outlasts a reload once persisted', () => {
    const storage = memory()
    const places = createListPlaces(storage)
    places.save('a', '/tasks?', 12.5)
    expect(createListPlaces(storage).placeOf('a', '/tasks?')).toBe(0)
    places.persist()
    expect(createListPlaces(storage).placeOf('a', '/tasks?')).toBe(12.5)
  })

  it('keeps only the most recent places', () => {
    const storage = memory()
    const places = createListPlaces(storage)
    for (let entry = 0; entry < 60; entry++) places.save(String(entry), `/list-${entry}?`, entry + 1)
    places.save('10', '/list-10?', 11)
    places.persist()
    const reloaded = createListPlaces(storage)
    expect(reloaded.placeOf('9', '/list-9?')).toBe(0)
    expect(reloaded.placeOf('10', '/list-10?')).toBe(11)
    expect(reloaded.placeOf('59', '/list-59?')).toBe(60)
    expect((JSON.parse(storage.getItem('protobase:list-places')!) as unknown[]).length).toBe(50)
  })

  it('ignores what it did not write, and unavailable storage', () => {
    const storage = memory()
    storage.setItem('protobase:list-places', JSON.stringify([{ entry: 'a', url: '/tasks?', place: 'far' }, { entry: 'b' }]))
    expect(createListPlaces(storage).placeOf('a', '/tasks?')).toBe(0)
    const blocked = { getItem: () => { throw new DOMException('blocked', 'SecurityError') }, setItem: () => { throw new DOMException('full', 'QuotaExceededError') } }
    const places = createListPlaces(blocked)
    places.save('a', '/tasks?', 3)
    places.persist()
    expect(places.placeOf('a', '/tasks?')).toBe(3)
  })
})
