import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@protobase/client'
import type { RelatedColumnModel, ResourceModel } from '@protobase/schema'
import { createGridLoader } from './grid-loader'
import { groupByOwner, loadRelatedColumn } from './related-column-rows'

const field = (name: string, type: string, extra: object = {}) => ({ name, type, ...extra })
const objectives = { name: 'objectives', primaryKey: ['id'], fields: { id: field('id', 'integer'), title: field('title', 'text') } } as unknown as ResourceModel
const tasks = {
  name: 'tasks',
  primaryKey: ['id'],
  fields: { id: field('id', 'integer'), title: field('title', 'text'), status: field('status', 'enum'), objective_id: field('objective_id', 'relation', { relation: { resource: 'objectives', columns: ['objective_id'] } }) },
} as unknown as ResourceModel
const links = {
  name: 'objective_tasks',
  primaryKey: ['objective_id', 'task_id'],
  fields: { objective_id: field('objective_id', 'relation', { relation: { resource: 'objectives' } }), task_id: field('task_id', 'relation', { relation: { resource: 'tasks' } }) },
} as unknown as ResourceModel
const resources = { objectives, tasks, objective_tasks: links }

const through: RelatedColumnModel = { name: 'tasks', resource: 'tasks', field: 'id', through: { resource: 'objective_tasks', field: 'objective_id', key: 'task_id' }, status: 'status', sort: 'id' }

// A search over the join records and the tasks, answering the pairs and tasks given, whatever the filter, page by page
const fakeClient = (pairs: Array<[number, number]>, rows: Array<Record<string, unknown>>) => {
  const search = vi.fn(async (resource: string, params: { pageSize?: number; pageToken?: string }) => {
    const all = resource === 'objective_tasks' ? pairs.map(([objective_id, task_id]) => ({ objective_id, task_id })) : rows
    const start = Number(params.pageToken ?? 0)
    const end = start + (params.pageSize ?? all.length)
    return { items: all.slice(start, end), nextPageToken: end < all.length ? String(end) : '', totalSizeEstimate: all.length }
  })
  return { search, client: { search } as unknown as Client }
}

describe('groupByOwner', () => {
  it('gives each owner the records its links hold, in the order the records come in', () => {
    const records = [{ id: 3 }, { id: 1 }, { id: 2 }]
    const grouped = groupByOwner([['a', '1'], ['a', '3'], ['b', '1'], ['b', '1']], records, 'id')
    expect(grouped.get('a')).toEqual([{ id: 3 }, { id: 1 }])
    expect(grouped.get('b')).toEqual([{ id: 1 }])
    expect(grouped.has('c')).toBe(false)
  })

  it('reads a labelled relation by its id', () => {
    expect(groupByOwner([['7', '7']], [{ id: 1, objective_id: { id: 7, name: 'Launch' } }], 'objective_id').get('7')).toHaveLength(1)
  })
})

describe('loadRelatedColumn', () => {
  it('reads the join records of the owners, then the records they pick, in the column order', async () => {
    const { client, search } = fakeClient([[1, 10], [1, 11], [2, 11]], [{ id: 11, title: 'Docs', status: 'done' }, { id: 10, title: 'Code', status: 'todo' }])
    const grouped = await loadRelatedColumn({ client, resources, views: {}, load: { column: through, fields: ['title'] }, owners: ['1', '2', '3'] })
    expect(search.mock.calls[0]).toEqual(['objective_tasks', { filter: 'in(objective_id, "1", "2", "3")', fields: ['objective_id', 'task_id'], pageSize: 500 }])
    expect(search.mock.calls[1]![1]).toMatchObject({ filter: 'in(id, "10", "11")', orderBy: 'id', fields: ['id', 'status', 'title'], pageSize: 500 })
    expect(grouped.get('1')!.map((task) => task.id)).toEqual([11, 10])
    expect(grouped.get('2')!.map((task) => task.id)).toEqual([11])
    expect(grouped.has('3')).toBe(false)
  })

  it('reads the records that point at the owners directly without a join resource, and adds the column filter', async () => {
    const direct: RelatedColumnModel = { name: 'tasks', resource: 'tasks', field: 'objective_id', status: 'status', filter: 'status != "dropped"' }
    const { client, search } = fakeClient([], [{ id: 1, status: 'done', objective_id: 2 }])
    const grouped = await loadRelatedColumn({ client, resources, views: {}, load: { column: direct, fields: [] }, owners: ['2'] })
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0]![1]).toMatchObject({ filter: '(in(objective_id, "2")) AND (status != "dropped")' })
    expect(grouped.get('2')).toEqual([{ id: 1, status: 'done', objective_id: { id: 2, name: '2' } }])
  })

  it('gives every owner all its records when the join records and the records fill more than one page', async () => {
    const owners = Array.from({ length: 40 }, (_, owner) => owner + 1)
    const pairs = owners.flatMap((owner) => Array.from({ length: 15 }, (_, index) => [owner, owner * 100 + index] as [number, number]))
    const { client } = fakeClient(pairs, pairs.map(([, id]) => ({ id, title: `Task ${id}`, status: 'todo' })))
    const grouped = await loadRelatedColumn({ client, resources, views: {}, load: { column: through, fields: ['title'] }, owners: owners.map(String) })
    expect(owners.map((owner) => grouped.get(String(owner))?.length)).toEqual(owners.map(() => 15))
  })

  it('reads nothing more when no join record points at the owners', async () => {
    const { client, search } = fakeClient([], [])
    expect((await loadRelatedColumn({ client, resources, views: {}, load: { column: through, fields: [] }, owners: ['1'] })).size).toBe(0)
    expect(search).toHaveBeenCalledTimes(1)
  })
})

describe('createGridLoader with related columns', () => {
  it("puts each row's related records under the column's name, an empty list for a row without", async () => {
    const list = vi.fn(async () => ({ items: [{ id: 1, title: 'Launch' }, { id: 2, title: 'Grow' }], nextPageToken: '', totalSizeEstimate: 2 }))
    const { search } = fakeClient([[1, 10]], [{ id: 10, title: 'Code', status: 'todo' }])
    const client = { list, search } as unknown as Client
    const loader = createGridLoader({ queryClient: new QueryClient(), client, resources, views: {}, model: objectives, columns: ['title', 'tasks'], filter: '', orderBy: '', related: [{ column: through, fields: ['title'] }] })
    const { rows } = await loader.page(0)
    expect(rows.map((row) => [row.id, (row.tasks as unknown[]).length])).toEqual([['1', 1], ['2', 0]])
  })
})
