import { describe, expect, it } from 'vitest'
import { reloadTap } from './reload-tap'

const memoryStorage = () => {
  const items = new Map<string, string>()
  return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), removeItem: (key: string) => void items.delete(key) }
}

const tap = { notification: { url: '/tasks/1' } }

describe('reloadTap', () => {
  it('opens a tap at once while the app is not reloading', () => {
    const opened: unknown[] = []
    reloadTap({ storage: memoryStorage(), reloading: () => false }).receive(tap, (data) => void opened.push(data))
    expect(opened).toEqual([tap])
  })

  it('keeps a tap that arrives during a reload, for the page the app reloads into to open once', () => {
    const storage = memoryStorage()
    const opened: unknown[] = []
    reloadTap({ storage, reloading: () => true }).receive(tap, (data) => void opened.push(data))
    expect(opened).toEqual([])
    const after = reloadTap({ storage, reloading: () => false })
    after.resume((data) => void opened.push(data))
    after.resume((data) => void opened.push(data))
    expect(opened).toEqual([tap])
  })

  it('opens nothing on resume without a kept tap, and drops one it cannot read', () => {
    const storage = memoryStorage()
    const opened: unknown[] = []
    reloadTap({ storage, reloading: () => false }).resume((data) => void opened.push(data))
    storage.setItem('protobase.push.tap', '{')
    reloadTap({ storage, reloading: () => false }).resume((data) => void opened.push(data))
    expect(opened).toEqual([])
    expect(storage.items.size).toBe(0)
  })
})
