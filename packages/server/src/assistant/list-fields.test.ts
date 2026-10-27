import type { ResourceModel, ViewModel } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { listFields } from './list-fields'

const names = ['code', 'title', 'status', 'brief', 'outcome', 'size', 'owner', 'notes']
const tasks = { name: 'tasks', primaryKey: ['code'], fields: Object.fromEntries(names.map((name) => [name, { name, type: 'text' }])) } as unknown as ResourceModel

describe('listFields', () => {
  it("names the key, then the view's table columns, without the related columns and fields the caller cannot read", () => {
    const view = { resource: 'tasks', fields: {}, list: { columns: ['status', 'title', 'holds', 'secret'], relatedColumns: [{ name: 'holds' }] } } as unknown as ViewModel
    expect(listFields(tasks, view)).toEqual(['code', 'status', 'title'])
  })

  it('names the first six fields without a list', () => {
    expect(listFields(tasks, undefined)).toEqual(['code', 'title', 'status', 'brief', 'outcome', 'size'])
  })
})
