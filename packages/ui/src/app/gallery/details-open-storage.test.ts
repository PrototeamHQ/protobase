import { describe, expect, it } from 'vitest'
import { detailsOpenStorageKey, readDetailsOpen, writeDetailsOpen } from './details-open-storage'

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

describe("the lightbox's details open state in storage", () => {
  it('is closed until opened, and stores only the open state', () => {
    const storage = memory()
    expect(readDetailsOpen(storage)).toBe(false)
    writeDetailsOpen(storage, true)
    expect(storage.data.get(detailsOpenStorageKey)).toBe('true')
    expect(readDetailsOpen(storage)).toBe(true)
    writeDetailsOpen(storage, false)
    expect(readDetailsOpen(storage)).toBe(false)
    expect(storage.data.size).toBe(0)
  })

  it('falls back to closed when storage is unavailable', () => {
    expect(readDetailsOpen(unavailable)).toBe(false)
    expect(() => writeDetailsOpen(unavailable, true)).not.toThrow()
  })
})
