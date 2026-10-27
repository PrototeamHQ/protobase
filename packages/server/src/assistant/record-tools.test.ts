import type { ResourceModel, ViewModel } from '@protobase/schema'
import { describe, expect, it, vi } from 'vitest'
import { badRequest, forbidden, notFound } from '../problem'
import { describeResourceTool, getRecordTool, listRecordsTool, listResourcesTool, readRecordTools } from './record-tools'
import type { ToolRecords } from './records'
import type { ToolContext } from './tools'

const deals = {
  name: 'deals',
  primaryKey: ['id'],
  softDelete: 'deleted_at',
  fields: {
    id: { name: 'id', type: 'integer', nullable: false, readOnly: true, filterable: true, sortable: true },
    stage: { name: 'stage', type: 'enum', nullable: false, readOnly: false, filterable: true, sortable: false, enumValues: ['open', 'won'] },
    company: { name: 'company', type: 'relation', nullable: true, readOnly: false, filterable: false, sortable: false, relation: { resource: 'companies', columns: ['company_id'] } },
    notes: { name: 'notes', type: 'text', nullable: true, readOnly: false, filterable: false, sortable: false },
  },
} as unknown as ResourceModel
const dealsView = { resource: 'deals', names: { singular: 'Deal', plural: 'Deals' }, help: 'Open sales\nWon and lost ones too', fields: { stage: { label: 'Stage', help: 'Where it is' } }, list: { columns: ['stage', 'company'] } } as unknown as ViewModel

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
    expect(readRecordTools().map((tool) => [tool.name, tool.annotations?.readOnlyHint])).toEqual([['list_resources', true], ['describe_resource', true], ['list_records', true], ['count_records', true], ['get_record', true]])
  })

  it('list_resources lists each readable resource with its label and the first line of its help, without fields', async () => {
    expect(JSON.parse(await listResourcesTool().run({}, contextWith({})))).toEqual([{ name: 'deals', label: 'Deals', help: 'Open sales', key: ['id'], soft_delete: true }])
  })

  it('list_resources stays a short line per resource however many fields they have', async () => {
    const fields = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`field_${i}`, { ...deals.fields.stage!, name: `field_${i}` }]))
    const models = Array.from({ length: 35 }, (_, i) => ({ ...deals, name: `resource_${i}`, fields }))
    const context = { ...contextWith({}), resources: async () => ({ models, views: [] }) }
    expect((await listResourcesTool().run({}, context)).length).toBeLessThan(35 * 80)
  })

  it('describe_resource describes one resource with the labels, help and values its view gives', async () => {
    expect(JSON.parse(await describeResourceTool().run({ resource: 'deals' }, contextWith({})))).toEqual({
      name: 'deals',
      label: 'Deals',
      help: 'Open sales\nWon and lost ones too',
      key: ['id'],
      soft_delete: true,
      list_fields: ['id', 'stage', 'company'],
      fields: [
        { name: 'id', type: 'integer', optional: false, read_only: true, filterable: true, sortable: true },
        { name: 'stage', type: 'enum', label: 'Stage', help: 'Where it is', values: ['open', 'won'], optional: false, read_only: false, filterable: true, sortable: false },
        { name: 'company', type: 'relation', links_to: 'companies', optional: true, read_only: false, filterable: false, sortable: false },
        { name: 'notes', type: 'text', optional: true, read_only: false, filterable: false, sortable: false },
      ],
    })
  })

  it('describe_resource refuses a resource the caller may not read as text', async () => {
    expect(JSON.parse(await describeResourceTool().run({ resource: 'payroll' }, contextWith({})))).toEqual({ error: 'not-found', message: 'No resource payroll you may read; list_resources lists them.' })
    expect(await describeResourceTool().run({}, contextWith({}))).toBe('Pass the resource as { "resource": "<name>" }.')
  })

  it('list_records passes the arguments through, with 20 records a page when none is given', async () => {
    const list = vi.fn(async () => ({ items: [{ id: 1 }], next_page_token: '', total_size_estimate: 1 }))
    const context = contextWith({ list })
    expect(JSON.parse(await listRecordsTool().run({ resource: 'deals', fields: ['id', 'notes'], filter: 'stage = "open"', order_by: 'id desc', page_token: 't' }, context))).toEqual({ items: [{ id: 1 }], next_page_token: '', total_size_estimate: 1 })
    expect(list).toHaveBeenLastCalledWith('deals', { filter: 'stage = "open"', order_by: 'id desc', page_token: 't', fields: ['id', 'notes'], page_size: 20 })
    await listRecordsTool().run({ resource: 'deals', fields: ['id'], page_size: 7 }, context)
    expect(list).toHaveBeenLastCalledWith('deals', { fields: ['id'], page_size: 7 })
  })

  it('list_records returns the key and the table columns unless fields names others, and says which it leaves out', async () => {
    const list = vi.fn(async () => ({ items: [{ id: 1 }], next_page_token: '', total_size_estimate: 1 }))
    const page = JSON.parse(await listRecordsTool().run({ resource: 'deals' }, contextWith({ list })))
    expect(list).toHaveBeenLastCalledWith('deals', { fields: ['id', 'stage', 'company'], page_size: 20 })
    expect(page.omitted_fields).toEqual(['notes'])
  })

  it('list_records returns every field for ["*"]', async () => {
    const list = vi.fn(async () => ({ items: [{ id: 1 }], next_page_token: '', total_size_estimate: 1 }))
    const page = JSON.parse(await listRecordsTool().run({ resource: 'deals', fields: ['*'] }, contextWith({ list })))
    expect(list).toHaveBeenLastCalledWith('deals', { page_size: 20 })
    expect(page.omitted_fields).toBeUndefined()
  })

  it('list_records leaves the fields to the API for a resource it cannot describe', async () => {
    const list = vi.fn(async () => ({ items: [], next_page_token: '', total_size_estimate: 0 }))
    await listRecordsTool().run({ resource: 'companies' }, contextWith({ list }))
    expect(list).toHaveBeenLastCalledWith('companies', { page_size: 20 })
  })

  it('get_record reads a record by its key, with the fields asked for', async () => {
    const get = vi.fn(async () => ({ record: { id: 3 }, etag: '"e"' }))
    expect(JSON.parse(await getRecordTool().run({ resource: 'deals', key: ['a', 2] }, contextWith({ get })))).toEqual({ record: { id: 3 }, etag: '"e"' })
    expect(get).toHaveBeenLastCalledWith('deals', ['a', 2], { show_deleted: false })
    await getRecordTool().run({ resource: 'deals', key: 3, fields: ['id'] }, contextWith({ get }))
    expect(get).toHaveBeenLastCalledWith('deals', 3, { show_deleted: false, fields: ['id'] })
    await getRecordTool().run({ resource: 'deals', key: 3, fields: ['*'] }, contextWith({ get }))
    expect(get).toHaveBeenLastCalledWith('deals', 3, { show_deleted: false })
  })

  it('list_resources says a resource without a soft delete does not soft delete', async () => {
    const { softDelete: _, ...hardDeals } = deals
    const context = { ...contextWith({}), resources: async () => ({ models: [hardDeals], views: [] }) }
    expect(JSON.parse(await listResourcesTool().run({}, context))).toEqual([expect.objectContaining({ name: 'deals', soft_delete: false })])
  })

  it('passes show_deleted through to the records only when it is true', async () => {
    const list = vi.fn(async () => ({ items: [], next_page_token: '', total_size_estimate: 0 }))
    const get = vi.fn(async () => ({ record: { id: 3, deleted_at: '2026-08-01T00:00:00Z' }, etag: '"e"' }))
    const context = contextWith({ list, get })
    await listRecordsTool().run({ resource: 'deals', show_deleted: true }, context)
    expect(list).toHaveBeenLastCalledWith('deals', { fields: ['id', 'stage', 'company'], page_size: 20, show_deleted: true })
    await listRecordsTool().run({ resource: 'deals', show_deleted: false }, context)
    expect(list).toHaveBeenLastCalledWith('deals', { fields: ['id', 'stage', 'company'], page_size: 20 })
    expect(JSON.parse(await getRecordTool().run({ resource: 'deals', key: 3, show_deleted: true }, context))).toEqual({ record: { id: 3, deleted_at: '2026-08-01T00:00:00Z' }, etag: '"e"' })
    expect(get).toHaveBeenLastCalledWith('deals', 3, { show_deleted: true })
  })

  it('refuses a show_deleted that is not JSON true or false, reading nothing', async () => {
    const list = vi.fn()
    const get = vi.fn()
    const context = contextWith({ list, get })
    for (const value of ['true', 'false', 0, 1, null, {}]) {
      const refusal = { error: 'invalid-parameter', message: 'Invalid parameter show_deleted: pass true or false' }
      expect(JSON.parse(await listRecordsTool().run({ resource: 'deals', show_deleted: value }, context))).toEqual(refusal)
      expect(JSON.parse(await getRecordTool().run({ resource: 'deals', key: 3, show_deleted: value }, context))).toEqual(refusal)
    }
    expect(list).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('gives the refusal of show_deleted on a resource without a soft delete back as text', async () => {
    const noSoftDelete = () => Promise.reject(badRequest('invalid-parameter', 'Resource "labels" does not soft delete, so show_deleted does not apply'))
    const context = contextWith({ list: noSoftDelete, get: noSoftDelete })
    const refusal = { error: 'invalid-parameter', message: 'Resource "labels" does not soft delete, so show_deleted does not apply' }
    expect(JSON.parse(await listRecordsTool().run({ resource: 'labels', show_deleted: true }, context))).toEqual(refusal)
    expect(JSON.parse(await getRecordTool().run({ resource: 'labels', key: 1, show_deleted: true }, context))).toEqual(refusal)
  })

  it('answers a missing soft-deleted record as any missing one', async () => {
    const context = contextWith({ get: () => Promise.reject(notFound('No deals with this key')) })
    const missing = await getRecordTool().run({ resource: 'deals', key: 9 }, context)
    expect(await getRecordTool().run({ resource: 'deals', key: 9, show_deleted: true }, context)).toBe(missing)
  })

  it('gives a refusal back as text', async () => {
    const context = contextWith({ list: () => Promise.reject(forbidden('forbidden', 'You may not list companies')), get: () => Promise.reject(notFound('There is no deal 9')) })
    expect(JSON.parse(await listRecordsTool().run({ resource: 'companies' }, context))).toEqual({ error: 'forbidden', message: 'You may not list companies' })
    expect(JSON.parse(await getRecordTool().run({ resource: 'deals', key: '9' }, context))).toEqual({ error: 'not-found', message: 'There is no deal 9' })
  })

  it('rethrows an unexpected error', async () => {
    const context = contextWith({ list: () => Promise.reject(new Error('connection lost')), get: () => Promise.reject(new Error('relation "deals" does not exist')) })
    await expect(listRecordsTool().run({ resource: 'deals' }, context)).rejects.toThrow('connection lost')
    await expect(listRecordsTool().run({ resource: 'deals', show_deleted: true }, context)).rejects.toThrow('connection lost')
    await expect(getRecordTool().run({ resource: 'deals', key: 3, show_deleted: true }, context)).rejects.toThrow('does not exist')
  })

  it('asks for the arguments it is missing', async () => {
    expect(await getRecordTool().run({ resource: 'deals' }, contextWith({}))).toContain('Pass the resource and key')
  })
})
