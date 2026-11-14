import { describe, expect, it } from 'vitest'
import { graphViewStorageKey, readGraphView, writeGraphView } from './graph-view'

const memory = () => {
  const data = new Map<string, string>()
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key) }
}

const blocked = () => {
  throw new DOMException('blocked', 'SecurityError')
}

describe('the graph view choice', () => {
  it('remembers simple, and pins by forgetting the choice, which is also what nothing chosen reads as', () => {
    const storage = memory()
    expect(readGraphView(storage)).toBe('pins')
    writeGraphView(storage, 'simple')
    expect(storage.data.get(graphViewStorageKey)).toBe('simple')
    expect(readGraphView(storage)).toBe('simple')
    writeGraphView(storage, 'pins')
    expect(storage.data.size).toBe(0)
  })

  it('reads as pins when storage is unavailable', () => {
    expect(readGraphView({ getItem: blocked })).toBe('pins')
    expect(() => writeGraphView({ setItem: blocked, removeItem: blocked }, 'simple')).not.toThrow()
  })
})
