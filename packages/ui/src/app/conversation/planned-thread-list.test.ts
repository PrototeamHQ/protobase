import { describe, expect, it, vi } from 'vitest'
import { threadListOf } from './planned-thread-list'

const planned = { isPending: false, error: null, rows: [{ id: 2 }, { id: 1 }], labels: { sender: { 5: 'Ada' } } }
const own = (pages: number, items: Record<string, unknown>[] = [], hasNextPage = false) => ({
  pages,
  items,
  labels: {},
  hasNextPage,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  isLoading: pages === 0,
  error: null,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
})

describe('threadListOf', () => {
  it('draws the planned latest messages, with earlier ones left when they fill its limit', () => {
    const expand = vi.fn()
    const list = threadListOf({ planned, limit: 2, expanded: false, expand, own: own(0) })
    expect(list).toMatchObject({ items: planned.rows, labels: planned.labels, hasNextPage: true, isFetchingNextPage: false })
    list.fetchNextPage()
    expect(expand).toHaveBeenCalled()
    expect(threadListOf({ planned, limit: 3, expanded: false, expand, own: own(0) }).hasNextPage).toBe(false)
  })

  it('keeps the planned messages, loading, while its own read takes its first page and the one after it', () => {
    expect(threadListOf({ planned, limit: 2, expanded: true, expand: vi.fn(), own: own(0) })).toMatchObject({ items: planned.rows, isFetchingNextPage: true })
    expect(threadListOf({ planned, limit: 2, expanded: true, expand: vi.fn(), own: own(1, planned.rows, true) })).toMatchObject({ items: planned.rows, isFetchingNextPage: true })
  })

  it('keeps the planned messages and labels while its own read loads its first page', () => {
    const read = { ...own(0), isLoading: true }
    expect(threadListOf({ planned, limit: 2, expanded: true, expand: vi.fn(), own: read })).toMatchObject({ items: planned.rows, labels: planned.labels, error: null })
  })

  it('keeps the planned messages when its own read fails before its first page, with its error and a retry of it', () => {
    const error = new Error('down')
    const read = { ...own(0), isLoading: false, error }
    const list = threadListOf({ planned, limit: 2, expanded: true, expand: vi.fn(), own: read })
    expect(list).toMatchObject({ items: planned.rows, labels: planned.labels, error, isFetchingNextPage: false, isFetchNextPageError: false })
    list.refetch()
    expect(read.refetch).toHaveBeenCalled()
  })

  it('loads its earlier messages with its own read after the planned first page', () => {
    const read = own(2, [{ id: 2 }, { id: 1 }, { id: 0 }])
    expect(threadListOf({ planned, limit: 2, expanded: true, expand: vi.fn(), own: read })).toBe(read)
    const one = own(1, planned.rows, false)
    expect(threadListOf({ planned, limit: 2, expanded: true, expand: vi.fn(), own: one })).toBe(one)
  })

  it('reads by itself without a planned read', () => {
    const read = own(1, [{ id: 1 }])
    expect(threadListOf({ planned: undefined, limit: 2, expanded: false, expand: vi.fn(), own: read })).toBe(read)
  })
})
