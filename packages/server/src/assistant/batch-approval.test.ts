import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { Locale } from '@protobase/schema/internal'
import { describe, expect, it } from 'vitest'
import type { Row } from '../types'
import { batchApproval } from './batch-approval'
import type { WriteOperation } from './batch-write-args'
import { writeText } from './write-messages'
import { createApproval, deleteApproval, describedResource, updateApproval } from './write-prompts'

const model = {
  name: 'tasks',
  primaryKey: ['id'],
  fields: {
    id: { name: 'id', type: 'bigint' },
    title: { name: 'title', type: 'text' },
    done: { name: 'done', type: 'boolean' },
    parent_id: { name: 'parent_id', type: 'bigint' },
  },
} as unknown as ResourceModel
const view = { resource: 'tasks', names: { singular: 'Task' }, fields: { title: { label: 'Title' }, done: { label: 'Done' } } } as unknown as ViewModel
const readable = { models: [model], views: [view] }
const described = (resource: string) => describedResource(readable, resource)
const tasks = described('tasks')

const approvalOf = (operations: WriteOperation[], { locale = 'en' as Locale, before = new Map<number, Row>(), soft = [] as string[] } = {}) =>
  batchApproval({ text: writeText(locale), described, operations, before, softDeletes: new Set(soft) })

const fix = { id: 3, title: 'Fix the lockout', done: false }
const mixed: WriteOperation[] = [
  { op: 'create', resource: 'tasks', data: { title: 'Plan' } },
  { op: 'update', resource: 'tasks', key: 3, etag: '*', data: { done: true } },
  { op: 'delete', resource: 'tasks', key: 3 },
]

describe('batchApproval', () => {
  it('lists a create, an update and a delete, each named and listed as its single write\'s approval', () => {
    const en = writeText('en')
    const asked = approvalOf(mixed, { before: new Map([[1, fix], [2, fix]]) })
    expect(asked.title).toBe('Run 3 writes in one transaction?')
    expect(asked.fields).toEqual([
      { label: `1. ${createApproval(en, tasks, { title: 'Plan' }).title.slice(0, -1)}`, value: 'Title: Plan' },
      { label: `2. ${updateApproval(en, tasks, 3, fix, { done: true }).title.slice(0, -1)}`, value: 'Done: No -> Yes' },
      { label: `3. ${deleteApproval(en, tasks, 3, fix, false).title.slice(0, -1)}`, value: 'This cannot be undone: the record is removed for good.' },
    ])
    expect(asked.fields!.map(({ label }) => label)).toEqual(['1. Create Task "Plan"', '2. Update Task #3 "Fix the lockout"', '3. Delete Task #3 "Fix the lockout"'])
    expect(asked.body).toBe('1 delete cannot be undone: those records are removed for good.\nEither all of them are written or none.')
    expect(asked).toMatchObject({ tone: 'danger', approveLabel: 'Write all', rejectLabel: 'Cancel' })
  })

  it('speaks Dutch to a Dutch user', () => {
    const asked = approvalOf(mixed, { locale: 'nl', before: new Map([[1, fix], [2, fix]]), soft: ['tasks'] })
    expect(asked.title).toBe('3 schrijfacties in één transactie uitvoeren?')
    expect(asked.body).toBe('Ze worden allemaal opgeslagen of geen enkele.')
    expect(asked.fields).toEqual([
      { label: '1. Task "Plan" aanmaken', value: 'Title: Plan' },
      { label: '2. Task #3 "Fix the lockout" bijwerken', value: 'Done: Nee -> Ja' },
      { label: '3. Task #3 "Fix the lockout" verwijderen', value: 'Het kan worden teruggezet: het record blijft bewaard, gemarkeerd als verwijderd.' },
    ])
    expect(asked).toMatchObject({ tone: 'warning', approveLabel: 'Alles opslaan', rejectLabel: 'Annuleren' })
  })

  it('names a key or value pointing at a create in the batch by that write\'s number', () => {
    const asked = approvalOf([
      { op: 'create', resource: 'tasks', data: { title: 'Plan' }, ref: 'plan' },
      { op: 'create', resource: 'tasks', data: { title: 'Step', parent_id: { $ref: 'plan' } } },
      { op: 'update', resource: 'tasks', key: { $ref: 'plan' }, etag: '*', data: { done: true } },
    ])
    expect(asked.fields!.slice(1)).toEqual([
      { label: '2. Create Task "Step"', value: 'Title: Step; Parent: the Task from write 1' },
      { label: '3. Update the Task from write 1', value: 'Done: Yes' },
    ])
  })

  it('names a record the caller may not read by its key, and says when an update changes nothing', () => {
    const asked = approvalOf([{ op: 'update', resource: 'tasks', key: 3, etag: '*', data: { done: false } }], { before: new Map([[0, fix]]) })
    expect(asked.fields).toEqual([{ label: '1. Update Task #3 "Fix the lockout"', value: 'No field changes.' }])
    expect(approvalOf([{ op: 'delete', resource: 'secrets', key: 'a‮b' }]).fields![0]!.label).toBe('1. Delete Secrets #a b')
  })

  it('lists the first 50 writes and counts the rest, with every permanent delete counted', () => {
    const operations: WriteOperation[] = [
      ...Array.from({ length: 60 }, (_, index): WriteOperation => ({ op: 'create', resource: 'tasks', data: { title: `T${index}` } })),
      { op: 'delete', resource: 'tasks', key: 1 },
    ]
    const asked = approvalOf(operations)
    expect(asked.fields).toHaveLength(50)
    expect(asked.body).toBe('1 delete cannot be undone: those records are removed for good.\nEither all of them are written or none.\nAnd 11 more writes, not listed.')
  })
})
