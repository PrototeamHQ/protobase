import { QueryError } from '@protobase/query'
import { describe, expect, it, vi } from 'vitest'
import { forbidden } from '../problem'
import { countRecordsTool } from './count-records-tool'
import type { ToolRecords } from './records'
import type { ToolContext } from './tools'

const contextWith = (records: Partial<ToolRecords>) =>
  ({
    session: { user: { id: 1, roles: ['sales'] } },
    show: () => {},
    approve: () => Promise.reject(new Error('no approval')),
    records: records as ToolRecords,
    resources: async () => ({ models: [], views: [] }),
  }) satisfies ToolContext

const run = async (args: Record<string, unknown>, records: Partial<ToolRecords>) => JSON.parse(await countRecordsTool().run(args, contextWith(records))) as unknown

describe('count_records', () => {
  it('counts what a filter finds through the list\'s exact count, returning no records', async () => {
    const list = vi.fn(async () => ({ items: [{ id: 1 }], next_page_token: 'n', total_size_estimate: 40, total_size: 42 }))
    expect(await run({ resource: 'deals', filter: 'stage = "open"' }, { list })).toEqual({ count: 42 })
    expect(list).toHaveBeenLastCalledWith('deals', { filter: 'stage = "open"', page_size: 1, count: 'exact' })
    await run({ resource: 'deals', show_deleted: true }, { list })
    expect(list).toHaveBeenLastCalledWith('deals', { page_size: 1, count: 'exact', show_deleted: true })
  })

  it('says when more match than the exact count counts, with the estimate', async () => {
    const list = vi.fn(async () => ({ items: [{ id: 1 }], next_page_token: 'n', total_size_estimate: 52_000 }))
    expect(await run({ resource: 'deals' }, { list })).toEqual({ more_than: 10_000, estimate: 52_000 })
  })

  it('counts per value of a field through the aggregate', async () => {
    const groups = { group_by: 'stage', groups: [{ value: 'open', count: 7 }, { value: 'won', count: 2 }] }
    const aggregate = vi.fn(async () => groups)
    expect(await run({ resource: 'deals', filter: 'amount > 10', group_by: 'stage' }, { aggregate })).toEqual(groups)
    expect(aggregate).toHaveBeenLastCalledWith('deals', { group_by: 'stage', filter: 'amount > 10' })
    await run({ resource: 'deals', group_by: 'company', limit: 5, label: 'name' }, { aggregate })
    expect(aggregate).toHaveBeenLastCalledWith('deals', { group_by: 'company', limit: 5, label: 'name' })
  })

  it('refuses options that do not go together, counting nothing', async () => {
    const list = vi.fn()
    const aggregate = vi.fn()
    expect(await run({ resource: 'deals', limit: 5 }, { list, aggregate })).toEqual({ error: 'invalid-parameter', message: 'Invalid parameter limit: Only with group_by' })
    expect(await run({ resource: 'deals', label: 'name' }, { list, aggregate })).toEqual({ error: 'invalid-parameter', message: 'Invalid parameter label: Only with group_by' })
    expect(await run({ resource: 'deals', group_by: 'stage', show_deleted: true }, { list, aggregate })).toEqual({ error: 'invalid-parameter', message: 'Invalid parameter show_deleted: Not with group_by' })
    expect(await run({ resource: 'deals', group_by: 'stage', limit: 1.5 }, { list, aggregate })).toEqual({ error: 'invalid-parameter', message: 'Invalid parameter limit: Pass a whole number' })
    expect(await run({ resource: 'deals', show_deleted: 'true' }, { list, aggregate })).toEqual({ error: 'invalid-parameter', message: 'Invalid parameter show_deleted: pass true or false' })
    expect(list).not.toHaveBeenCalled()
    expect(aggregate).not.toHaveBeenCalled()
  })

  it('gives a refusal back as text, the query layer\'s too', async () => {
    const list = () => Promise.reject(forbidden('forbidden', 'You may not list companies'))
    const aggregate = () => Promise.reject(new QueryError('not_filterable', 'Field "notes" is not filterable'))
    expect(await run({ resource: 'companies' }, { list })).toEqual({ error: 'forbidden', message: 'You may not list companies' })
    expect(await run({ resource: 'deals', group_by: 'notes' }, { aggregate })).toEqual({ error: 'not-filterable', message: 'Field "notes" is not filterable' })
  })

  it('rethrows an unexpected error', async () => {
    await expect(countRecordsTool().run({ resource: 'deals', group_by: 'stage' }, contextWith({ aggregate: () => Promise.reject(new Error('connection lost')) }))).rejects.toThrow('connection lost')
  })

  it('asks for the resource', async () => {
    expect(await countRecordsTool().run({}, contextWith({}))).toContain('Pass the resource')
  })
})
