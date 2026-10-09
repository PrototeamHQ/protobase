import { describe, expect, it } from 'vitest'
import { navOpenStorageKey, readNavOpen, writeNavOpen } from './nav-open-storage'

const memory = () => {
  const data = new Map<string, string>()
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key) }
}

const unavailable = {
  getItem: () => {
    throw new DOMException('blocked', 'SecurityError')
  },
  setItem: () => {
    throw new DOMException('blocked', 'SecurityError')
  },
  removeItem: () => {
    throw new DOMException('blocked', 'SecurityError')
  },
}

describe('sidebar entry open state in storage', () => {
  it('keys by entry', () => {
    expect(navOpenStorageKey('orders')).toBe('protobase:nav-open:orders')
  })

  it('is open until closed, and stores only the closed state', () => {
    const storage = memory()
    expect(readNavOpen(storage, 'k')).toBe(true)
    writeNavOpen(storage, 'k', false)
    expect(readNavOpen(storage, 'k')).toBe(false)
    writeNavOpen(storage, 'k', true)
    expect(readNavOpen(storage, 'k')).toBe(true)
    expect(storage.data.size).toBe(0)
  })

  it('falls back to open when storage is unavailable', () => {
    expect(readNavOpen(unavailable, 'k')).toBe(true)
    expect(() => writeNavOpen(unavailable, 'k', false)).not.toThrow()
  })
})
