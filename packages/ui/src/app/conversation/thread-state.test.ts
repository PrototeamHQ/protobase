import { describe, expect, it, vi } from 'vitest'
import { emptyLine, retryOf, showsErrorAbove, threadState } from './thread-state'

describe('threadState', () => {
  it('shows the error in place of the thread while no message has loaded', () => {
    expect(threadState({ error: new Error('offline'), isLoading: false, items: [] })).toBe('error')
  })

  it('keeps the loaded messages when a refetch fails', () => {
    expect(threadState({ error: new Error('offline'), isLoading: false, items: [{ id: 1 }] })).toBe('messages')
  })

  it('shows the loading line until the first page arrives, then the messages or the empty thread', () => {
    expect(threadState({ error: null, isLoading: true, items: [] })).toBe('loading')
    expect(threadState({ error: null, isLoading: false, items: [] })).toBe('messages')
  })
})

describe('showsErrorAbove', () => {
  it('shows a failed refetch or load of earlier messages above the messages that stay loaded', () => {
    expect(showsErrorAbove({ error: new Error('offline'), isLoading: false, items: [{ id: 1 }] })).toBe(true)
  })

  it('shows nothing above the thread without an error, or while the error takes its place', () => {
    expect(showsErrorAbove({ error: null, isLoading: false, items: [{ id: 1 }] })).toBe(false)
    expect(showsErrorAbove({ error: new Error('offline'), isLoading: false, items: [] })).toBe(false)
  })
})

describe('retryOf', () => {
  it('loads the earlier messages again when loading them failed', () => {
    const list = { isFetchNextPageError: true, fetchNextPage: vi.fn(), refetch: vi.fn() }
    retryOf(list)()
    expect(list.fetchNextPage).toHaveBeenCalledOnce()
    expect(list.refetch).not.toHaveBeenCalled()
  })

  it('reads the thread again when a refetch or the first load failed', () => {
    const list = { isFetchNextPageError: false, fetchNextPage: vi.fn(), refetch: vi.fn() }
    retryOf(list)()
    expect(list.refetch).toHaveBeenCalledOnce()
    expect(list.fetchNextPage).not.toHaveBeenCalled()
  })
})

describe('emptyLine', () => {
  const lines = { loading: 'Loading messages…', empty: 'No messages yet.' }

  it('says the thread is loading while its calls still load, and empty once they have', () => {
    expect(emptyLine({ isLoading: true }, lines)).toBe(lines.loading)
    expect(emptyLine({ isLoading: false }, lines)).toBe(lines.empty)
  })
})
