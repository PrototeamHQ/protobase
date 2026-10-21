import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { labelFieldOf, recordId, recordKey, recordTitleField } from './model-helpers'
import { withLabels } from './relation-labels'

const field = (name: string, type: FieldModel['type']) => ({ name, type }) as FieldModel
const model = { name: 'invoices', primaryKey: ['id'], fields: { id: field('id', 'bigint'), status: field('status', 'enum'), number: field('number', 'text'), notes: field('notes', 'text') } } as unknown as ResourceModel

describe('record titles', () => {
  it('uses the first text column of the view list', () => {
    const view = { list: { columns: ['status', 'notes', 'number'] } } as unknown as ViewModel
    expect(recordTitleField(model, view)).toBe('notes')
  })
  it('falls back to a name-like field, then to the key', () => {
    expect(recordTitleField(model, undefined)).toBe('number')
    expect(labelFieldOf({ ...model, fields: { id: field('id', 'bigint') } } as unknown as ResourceModel)).toBe('id')
  })
  it('never falls back to a write-only text field, which no record carries', () => {
    const sealed = { ...field('sealed', 'text'), writeOnly: true } as FieldModel
    expect(labelFieldOf({ ...model, fields: { id: field('id', 'bigint'), sealed } } as unknown as ResourceModel)).toBe('id')
  })
})

describe('record keys of list rows', () => {
  const tasks = { name: 'tasks', primaryKey: ['id'], fields: { id: field('id', 'text'), title: field('title', 'text') } } as unknown as ResourceModel
  const reports = {
    name: 'reports',
    primaryKey: ['task_id'],
    fields: { task_id: { name: 'task_id', type: 'relation', relation: { resource: 'tasks', columns: ['task_id'] } }, body: field('body', 'text') },
  } as unknown as ResourceModel
  const resources = { tasks, reports }
  const listRow = (model: ResourceModel, item: Record<string, unknown>) => withLabels(resources, model, Object.keys(model.fields), [item], { task_id: { 'task-7': 'Fix login' } })[0]!

  it('is the plain value of a text key', () => {
    expect(recordKey(tasks, listRow(tasks, { id: 'task-7', title: 'Fix login' }))).toBe('task-7')
  })
  it('is the related id of a relation key, not the name the list shows', () => {
    const row = listRow(reports, { task_id: 'task-7', body: 'Done' })
    expect(row.task_id).toEqual({ id: 'task-7', name: 'Fix login' })
    expect(recordKey(reports, row)).toBe('task-7')
    expect(recordId(reports, row)).toBe('task-7')
  })
})
