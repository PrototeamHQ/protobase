import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@protobase/client'
import { searchAll } from './search-all'

// A search that pages `items` by `pageSize` and `pageToken`, naming its records under the relation `owner`
const fakeClient = (items: Array<{ id: number }>) => {
  const search = vi.fn(async (_resource: string, params: { pageSize: number; pageToken?: string }) => {
    const start = Number(params.pageToken ?? 0)
    const end = start + params.pageSize
    const page = items.slice(start, end)
    return {
      items: page,
      nextPageToken: end < items.length ? String(end) : '',
      totalSizeEstimate: items.length,
      labels: { owner: Object.fromEntries(page.map((item) => [String(item.id), `Owner ${item.id}`])) },
    }
  })
  return { search, client: { search } as unknown as Client }
}

describe('searchAll', () => {
  it('reads every page, in order, and merges their labels', async () => {
    const items = Array.from({ length: 1200 }, (_, id) => ({ id }))
    const { client, search } = fakeClient(items)
    const all = await searchAll(client, 'tasks', { filter: 'status = "todo"' })
    expect(search).toHaveBeenCalledTimes(3)
    expect(search.mock.calls[0]).toEqual(['tasks', { filter: 'status = "todo"', pageSize: 500 }])
    expect(search.mock.calls[2]![1]).toMatchObject({ pageToken: '1000' })
    expect(all.items).toEqual(items)
    expect(all.labels.owner!['0']).toBe('Owner 0')
    expect(all.labels.owner!['1199']).toBe('Owner 1199')
  })

  it('makes one request when the first page holds them all', async () => {
    const { client, search } = fakeClient([{ id: 1 }, { id: 2 }])
    expect((await searchAll(client, 'tasks', {})).items).toHaveLength(2)
    expect(search).toHaveBeenCalledTimes(1)
  })
})
