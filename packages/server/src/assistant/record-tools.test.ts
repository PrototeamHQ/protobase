import type { ResourceModel, ViewModel } from '@protobase/schema'
import { describe, expect, it, vi } from 'vitest'
import { forbidden, notFound } from '../problem'
import { getRecordTool, listRecordsTool, listResourcesTool, readRecordTools } from './record-tools'
import type { ToolRecords } from './records'
import type { ToolContext } from './tools'

const deals = {
  name: 'deals',
  primaryKey: ['id'],
  fields: {
    id: { name: 'id', type: 'integer', nullable: false, readOnly: true, filterable: true, sortable: true },
    stage: { name: 'stage', type: 'enum', nullable: false, readOnly: false, filterable: true, sortable: false, enumValues: ['open', 'won'] },
    company: { name: 'company', type: 'relation', nullable: true, readOnly: false, filterable: false, sortable: false, relation: { resource: 'companies', columns: ['company_id'] } },
  },
} as unknown as ResourceModel
const dealsView = { resource: 'deals', names: { singular: 'Deal', plural: 'Deals' }, help: 'Open sales', fields: { stage: { label: 'Stage', help: 'Where it is' } } } as unknown as ViewModel

const contextWith = (records: Partial<ToolRecords>) =>
  ({
    session: { user: { id: 1, roles: ['sales'] } },
    show: () => {},
    approve: () => Promise.reject(new Error('no approval')),
    records: records as ToolRecords,
    resources: async () => ({ models: [deals], views: [dealsView] }),
  }) satisfies ToolContext

describe('record tools', () => {
  it('are all read-only, in order', () => {
    expect(readRecordTools().map((tool) => [tool.name, tool.annotations?.readOnlyHint])).toEqual([['list_resources', true], ['list_records', true], ['get_record', true]])
  })

  it('list_resources describes each readable resource with the labels its view gives', async () => {
    expect(JSON.parse(await listResourcesTool().run({}, contextWith({})))).toEqual([{
      name: 'deals',
      label: 'Deals',
      help: 'Open sales',
      key: ['id'],
      fields: [
        { name: 'id', type: 'integer', optional: false, read_only: true, filterable: true, sortable: true },
        { name: 'stage', type: 'enum', label: 'Stage', help: 'Where it is', values: ['open', 'won'], optional: false, read_only: false, filterable: true, sortable: false },
        { name: 'company', type: 'relation', links_to: 'companies', optional: true, read_only: false, filterable: false, sortable: false },
      ],
    }])
  })

  it('list_records passes the arguments through, with 20 records a page when none is given', async () => {
    const list = vi.fn(async () => ({ items: [{ id: 1 }], next_page_token: '', total_size_estimate: 1 }))
    const context = contextWith({ list })
    expect(JSON.parse(await listRecordsTool().run({ resource: 'deals', filter: 'stage = "open"', order_by: 'id desc', page_token: 't' }, context))).toMatchObject({ items: [{ id: 1 }] })
    expect(list).toHaveBeenLastCalledWith('deals', { filter: 'stage = "open"', order_by: 'id desc', page_token: 't', page_size: 20 })
    await listRecordsTool().run({ resource: 'deals', page_size: 7 }, context)
    expect(list).toHaveBeenLastCalledWith('deals', { page_size: 7 })
  })

  it('get_record reads a record by its key', async () => {
    const get = vi.fn(async () => ({ record: { id: 3 }, etag: '"e"' }))
    expect(JSON.parse(await getRecordTool().run({ resource: 'deals', key: ['a', 2] }, contextWith({ get })))).toEqual({ record: { id: 3 }, etag: '"e"' })
    expect(get).toHaveBeenCalledWith('deals', ['a', 2])
  })

  it('gives a refusal back as text', async () => {
    const context = contextWith({ list: () => Promise.reject(forbidden('forbidden', 'You may not list companies')), get: () => Promise.reject(notFound('There is no deal 9')) })
    expect(JSON.parse(await listRecordsTool().run({ resource: 'companies' }, context))).toEqual({ error: 'forbidden', message: 'You may not list companies' })
    expect(JSON.parse(await getRecordTool().run({ resource: 'deals', key: '9' }, context))).toEqual({ error: 'not-found', message: 'There is no deal 9' })
  })

  it('rethrows an unexpected error', async () => {
    const context = contextWith({ list: () => Promise.reject(new Error('connection lost')) })
    await expect(listRecordsTool().run({ resource: 'deals' }, context)).rejects.toThrow('connection lost')
  })

  it('asks for the arguments it is missing', async () => {
    expect(await getRecordTool().run({ resource: 'deals' }, contextWith({}))).toContain('Pass the resource and key')
  })
})
