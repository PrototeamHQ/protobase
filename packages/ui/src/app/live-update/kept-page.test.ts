import { describe, expect, it } from 'vitest'
import { forgetPage, keepPage, restorePage } from './kept-page'

const memoryStorage = () => {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

const memoryHistory = (state: unknown = null) => {
  const replaced: Array<[unknown, string]> = []
  return {
    replaced,
    state,
    replaceState: (next: unknown, _unused: string, url?: string | URL | null) => void replaced.push([next, String(url)]),
  }
}

const location = { pathname: '/tasks/12', search: '?tab=notes', hash: '#top' }

describe('keepPage and restorePage', () => {
  it('returns the reloaded app to the page it showed, with its history entry, once', () => {
    const storage = memoryStorage()
    keepPage(storage, location, memoryHistory({ protobaseEntry: 'abc', protobaseIndex: 4 }))
    const history = memoryHistory()
    restorePage(storage, history)
    restorePage(storage, history)
    expect(history.replaced).toEqual([[{ protobaseEntry: 'abc' }, '/tasks/12?tab=notes#top']])
  })

  it('keeps the page without an entry when the history has none', () => {
    const storage = memoryStorage()
    keepPage(storage, location, memoryHistory())
    const history = memoryHistory()
    restorePage(storage, history)
    expect(history.replaced).toEqual([[null, '/tasks/12?tab=notes#top']])
  })

  it('changes nothing with no page kept, a forgotten one, or anything but a path on this origin', () => {
    const storage = memoryStorage()
    const history = memoryHistory()
    restorePage(storage, history)
    keepPage(storage, location, history)
    forgetPage(storage)
    restorePage(storage, history)
    for (const kept of ['not json', 'null', '{"url":"//evil.example.com/"}', '{"url":"https://evil.example.com/"}', '{"url":3}']) {
      storage.items.set('protobase.liveUpdate.page', kept)
      restorePage(storage, history)
      expect(storage.items.size, kept).toBe(0)
    }
    expect(history.replaced).toEqual([])
  })
})
