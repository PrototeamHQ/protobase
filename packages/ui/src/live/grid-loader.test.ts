import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { createGridLoader } from './grid-loader'

const model = { name: 'orders', table: { name: 'orders' }, primaryKey: ['id'], fields: { id: { name: 'id', type: 'integer' }, status: { name: 'status', type: 'enum' } } } as unknown as ResourceModel

const setup = () => {
  const list = vi.fn(async (_resource: string, params: { pageToken?: string }) => ({
    items: [{ id: Number(params.pageToken?.replace('t', '') || 0) * 40, status: 'draft' }],
    nextPageToken: `t${Number(params.pageToken?.replace('t', '') || 0) + 1}`,
    totalSizeEstimate: 100_000,
  }))
  const seek = vi.fn(async (_resource: string, o: { position: number }) => ({
    items: o.position >= 4000 ? [] : [{ id: o.position, status: 'draft' }],
    nextPageToken: 'after-jump',
    prevPageToken: '',
    totalSizeEstimate: 100_000,
  }))
  const client = { list, seek } as unknown as Client
  const queryClient = new QueryClient()
  const createLoader = () =>
    createGridLoader({ queryClient, client, resources: { orders: model }, views: {}, model, columns: ['status'], filter: 'status = "draft"', orderBy: 'id asc' })
  return { list, seek, loader: createLoader(), createLoader }
}

describe('createGridLoader', () => {
  it('loads the first page without a token and reports the total', async () => {
    const { list, loader } = setup()
    const first = await loader.page(0)
    expect(first.total).toBe(100_000)
    expect(list.mock.calls[0]![1]).toMatchObject({ filter: 'status = "draft"', orderBy: 'id asc', pageSize: 40, pageToken: '' })
  })

  it('follows next_page_token for the page after one it has loaded', async () => {
    const { seek, list, loader } = setup()
    await loader.page(0)
    await loader.page(1)
    expect(list.mock.calls[1]![1]).toMatchObject({ pageToken: 't1' })
    expect(seek).not.toHaveBeenCalled()
  })

  it('keeps following the cursor in a new loader over the same cached pages', async () => {
    const { seek, list, loader, createLoader } = setup()
    await loader.page(0)
    await loader.page(1)
    await createLoader().page(2)
    expect(list.mock.calls[2]![1]).toMatchObject({ pageToken: 't2' })
    expect(seek).not.toHaveBeenCalled()
  })

  it('reads on from a page that is still loading instead of seeking again', async () => {
    const { seek, list, loader } = setup()
    await Promise.all([loader.page(5), loader.page(6)])
    expect(seek).toHaveBeenCalledTimes(1)
    expect(list.mock.calls[0]![1]).toMatchObject({ pageToken: 'after-jump' })
  })

  it('stops after the last page instead of starting over', async () => {
    const list = vi.fn(async () => ({ items: [{ id: 1 }], nextPageToken: '', totalSizeEstimate: 1 }))
    const client = { list } as unknown as Client
    const loader = createGridLoader({ queryClient: new QueryClient(), client, resources: {}, views: {}, model, columns: [], filter: '', orderBy: 'id asc' })
    await loader.page(0)
    expect((await loader.page(1)).rows).toEqual([])
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('seeks to the row position when jumping, and continues from its token', async () => {
    const { seek, list, loader } = setup()
    expect((await loader.page(5)).rows[0]).toMatchObject({ id: '200' })
    expect(seek).toHaveBeenCalledWith('orders', { orderBy: 'id asc', filter: 'status = "draft"', pageSize: 40, position: 200 })
    await loader.page(6)
    expect(list.mock.calls[0]![1]).toMatchObject({ pageToken: 'after-jump' })
  })

  it('returns no rows past the end', async () => {
    const { list, loader } = setup()
    expect((await loader.page(100)).rows).toEqual([])
    expect(list).not.toHaveBeenCalled()
  })

  it('counts a short first page exactly instead of trusting the estimate', async () => {
    const list = vi.fn(async () => ({ items: [{ id: 1 }, { id: 2 }, { id: 3 }], nextPageToken: '', totalSizeEstimate: 2 }))
    const client = { list } as unknown as Client
    const loader = createGridLoader({ queryClient: new QueryClient(), client, resources: {}, views: {}, model, columns: [], filter: '', orderBy: 'id asc' })
    expect((await loader.page(0)).total).toBe(3)
  })

  it('asks for an exact count when the estimate is small but there are more pages', async () => {
    const list = vi.fn(async (_resource: string, params: { count?: string }) => ({ items: [{ id: 1 }], nextPageToken: 't1', totalSizeEstimate: 40, totalSize: params.count ? 123 : undefined }))
    const client = { list } as unknown as Client
    const loader = createGridLoader({ queryClient: new QueryClient(), client, resources: {}, views: {}, model, columns: [], filter: '', orderBy: 'id asc' })
    expect((await loader.page(0)).total).toBe(123)
  })

  it('keys rows by their primary key', async () => {
    const { loader } = setup()
    expect((await loader.page(0)).rows[0]).toMatchObject({ id: '0', status: 'draft' })
  })
})
