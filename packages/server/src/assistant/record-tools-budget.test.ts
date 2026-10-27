import { describe, expect, it, vi } from 'vitest'
import { getRecordTool, listRecordsTool } from './record-tools'
import type { ListParams, ToolRecords } from './records'
import { resultBudget } from './result-budget'
import type { ToolContext } from './tools'

const contextWith = (records: Partial<ToolRecords>) =>
  ({
    session: { user: { id: 1, roles: ['sales'] } },
    show: () => {},
    approve: () => Promise.reject(new Error('no approval')),
    records: records as ToolRecords,
    resources: async () => ({ models: [], views: [] }),
  }) satisfies ToolContext

const tasks = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, body: `${index}`.padEnd(5000, 'x'), etag: `"${index}"` }))
const pageOf = ({ page_size = 20 }: ListParams) => ({ items: tasks.slice(0, page_size), next_page_token: `after-${page_size}`, total_size_estimate: 100 })

describe('record tools within the size budget', () => {
  it('list_records cuts long values first, naming each with its full length', async () => {
    const list = vi.fn(async (_resource: string, params: ListParams = {}) => pageOf(params))
    const json = await listRecordsTool().run({ resource: 'tasks', page_size: 10 }, contextWith({ list }))
    expect(json.length).toBeLessThanOrEqual(resultBudget)
    const page = JSON.parse(json)
    expect(page.items).toHaveLength(10)
    expect(page.next_page_token).toBe('after-10')
    expect(page.cut_fields[0]).toEqual({ field: 'items[0].body', length: 5000 })
    expect(page.note).toContain('get_record')
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('list_records lists fewer records when cut values still do not fit, with the token after the last', async () => {
    const list = vi.fn(async (_resource: string, params: ListParams = {}) => pageOf(params))
    const json = await listRecordsTool().run({ resource: 'tasks', page_size: 100, page_token: 't' }, contextWith({ list }))
    expect(json.length).toBeLessThanOrEqual(resultBudget)
    const page = JSON.parse(json)
    const count = page.items.length
    expect(count).toBeGreaterThan(1)
    expect(count).toBeLessThan(100)
    expect(list).toHaveBeenLastCalledWith('tasks', { page_token: 't', page_size: count })
    expect(page.next_page_token).toBe(`after-${count}`)
    expect(page.items[0].etag).toBe('"0"')
    expect(page.note).toContain(`Only ${count} records fit`)
  })

  it('get_record cuts a long value and reads it whole in pieces', async () => {
    const body = 'é'.repeat(70_000)
    const get = vi.fn(async () => ({ record: { id: 1, body, data: { a: 1 } }, etag: '"e"' }))
    const context = contextWith({ get })
    const cut = JSON.parse(await getRecordTool().run({ resource: 'tasks', key: 1 }, context))
    expect(cut.cut_fields).toEqual([{ field: 'record.body', length: 70_000 }])
    expect(cut.etag).toBe('"e"')
    const pieces: string[] = []
    let offset: number | undefined = 0
    while (offset !== undefined) {
      const piece = JSON.parse(await getRecordTool().run({ resource: 'tasks', key: 1, field: 'body', offset, max_chars: 30_000 }, context))
      expect(piece.length).toBe(70_000)
      pieces.push(piece.value)
      offset = piece.next_offset
    }
    expect(pieces.join('')).toBe(body)
    expect(JSON.parse(await getRecordTool().run({ resource: 'tasks', key: 1, field: 'data' }, context))).toEqual({ field: 'data', offset: 0, length: 7, value: '{"a":1}' })
  })

  it('get_record refuses a field the record lacks or a bad offset', async () => {
    const context = contextWith({ get: async () => ({ record: { id: 1 }, etag: '"e"' }) })
    expect(JSON.parse(await getRecordTool().run({ resource: 'tasks', key: 1, field: 'body' }, context))).toEqual({ error: 'invalid-parameter', message: 'Invalid parameter field: pass one of id' })
    expect(JSON.parse(await getRecordTool().run({ resource: 'tasks', key: 1, field: 'id', offset: -1 }, context)).error).toBe('invalid-parameter')
    expect(JSON.parse(await getRecordTool().run({ resource: 'tasks', key: 1, field: 'id', max_chars: 0 }, context)).error).toBe('invalid-parameter')
  })
})
