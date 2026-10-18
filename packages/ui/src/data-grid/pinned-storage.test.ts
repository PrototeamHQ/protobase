import { describe, expect, it } from 'vitest'
import { pinnedStorageKey, readPinned, writePinned } from './pinned-storage'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key) }
}

describe('pinned columns in storage', () => {
  it('keys by user and resource', () => {
    expect(pinnedStorageKey('u1', 'orders')).toBe('protobase:pinned:u1:orders')
  })

  it('round-trips the pinned ids in order', () => {
    const storage = memory()
    writePinned(storage, 'k', ['number', 'status'])
    expect(readPinned(storage, 'k')).toEqual(['number', 'status'])
  })

  it('keeps an empty pin list, so an unpinned default stays unpinned', () => {
    const storage = memory()
    writePinned(storage, 'k', ['number'])
    writePinned(storage, 'k', [])
    expect(readPinned(storage, 'k')).toEqual([])
  })

  it('ignores values it did not write', () => {
    const storage = memory()
    storage.setItem('k', '{"a":1}')
    expect(readPinned(storage, 'k')).toBeUndefined()
  })

  it('treats unavailable storage as nothing pinned', () => {
    const blocked = { getItem: () => { throw new DOMException('blocked', 'SecurityError') } }
    expect(readPinned(blocked, 'k')).toBeUndefined()
  })
})
