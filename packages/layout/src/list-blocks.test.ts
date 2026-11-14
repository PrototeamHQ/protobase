import { describe, expect, it } from 'vitest'
import { Field, Page, RecordCard, Table } from './blocks'
import { blockSpecs } from './block-specs'
import { pageFindings } from './check-page'
import { structureProblems } from './check-structure'
import { ArrayField, RecordsIterator, ReferenceArrayField, ReferenceField, ReferenceManyField } from './list-blocks'
import type { LayoutNode } from './node'
import { prunePage } from './prune-page'
import { field, model, nested } from './testing/models'

// A task with its claims, each claim with its steps; a task lists its labels and the workers it is for as JSON.
const models = {
  ...nested,
  tasks: model('tasks', [...Object.values(nested.tasks!.fields), field('labels', 'json'), field('worker_ids', 'json')]),
}
const input = { models, actions: () => new Set<string>() }
const page = (...children: LayoutNode[]) => ({ name: 'board', title: 'Board', tree: Page({ title: 'Board', children: RecordCard({ resource: 'tasks', children }) }) })
const findings = (...children: LayoutNode[]) => pageFindings(page(...children), input)

const claims = (...children: LayoutNode[]) => ReferenceManyField({ reference: 'task_claims', target: 'task_id', children })

describe('list blocks', () => {
  it('declare which props name what they read', () => {
    expect(blockSpecs.ReferenceManyField!.reads).toEqual({ resource: 'reference', filter: 'filter', sort: 'sort' })
    expect(blockSpecs.ReferenceArrayField!.reads).toEqual({ resource: 'reference', filter: 'filter', sort: 'sort' })
    expect(blockSpecs.ReferenceField!.reads).toEqual({ resource: 'reference' })
    expect(blockSpecs.ArrayField!.reads).toBeUndefined()
    expect(blockSpecs.RecordsIterator!.reads).toBeUndefined()
  })

  it('check a two-level nested list through every record around it', () => {
    const steps = ReferenceManyField({ reference: 'claim_steps', target: 'claim_id', children: RecordsIterator({ children: [Field({ name: 'name' }), Field({ name: '../claimed_at' }), Field({ name: 'title' })] }) })
    expect(findings(claims(RecordsIterator({ children: [Field({ name: 'claimed_at' }), steps] })))).toEqual({ problems: [], warnings: [] })
  })

  it('take react-admin sort and filter objects, and AIP text', () => {
    const block = (props: Record<string, unknown>) => ReferenceManyField({ reference: 'task_claims', target: 'task_id', ...props })
    expect(findings(block({ sort: { field: 'claimed_at', order: 'DESC' }, filter: { status: 'open' } })).problems).toEqual([])
    expect(findings(block({ sort: 'claimed_at desc', filter: "status = 'open' OR status = 'held'" })).problems).toEqual([])
    expect(structureProblems(page(block({ sort: { field: 'claimed_at', order: 'down' } })).tree)[0]).toContain('"sort" must be an AIP-132 order')
    expect(findings(block({ filter: { colour: 'red' } })).problems[0]).toContain('filter:')
  })

  it('read at most the API’s largest page, and sort by a key that sorts unless told otherwise', () => {
    expect(findings(ReferenceManyField({ reference: 'task_claims', target: 'task_id', perPage: 600 })).problems[0]).toContain('perPage: at most 500')
    const unsorted = { ...models, task_claims: { ...models.task_claims!, fields: { ...models.task_claims!.fields, id: { ...models.task_claims!.fields.id!, sortable: false } } } }
    const tree = page(ReferenceManyField({ reference: 'task_claims', target: 'task_id' }))
    expect(pageFindings(tree, { ...input, models: unsorted }).problems[0]).toContain('sort:')
    expect(pageFindings(page(ReferenceManyField({ reference: 'task_claims', target: 'task_id', sort: 'claimed_at' })), { ...input, models: unsorted }).problems).toEqual([])
  })

  it('name a target that is no field of the resource it reads', () => {
    expect(findings(ReferenceManyField({ reference: 'task_claims', target: 'task' })).problems).toEqual([
      '<Page> › <RecordCard resource="tasks"> › <ReferenceManyField reference="task_claims">: target: "task" is no field of task_claims',
    ])
  })

  it('read their source from a record around them, by default its id', () => {
    const tree = Page({ title: 'Board', children: ReferenceManyField({ reference: 'task_claims', target: 'task_id' }) })
    expect(structureProblems(tree)).toEqual(['<Page> › <ReferenceManyField reference="task_claims">: reads its "source" from a record: put it inside a RecordCard, a CardRow or a RecordsIterator'])
    expect(findings(ReferenceManyField({ reference: 'task_claims', target: 'task_id', source: 'titel' })).problems[0]).toContain('"titel" is no field of tasks; did you mean title?')
  })

  it('refuse a filter that would make the list wait twice for the record around it', () => {
    const tree = claims(RecordsIterator({ children: ReferenceManyField({ reference: 'claim_steps', target: 'claim_id', filter: 'name = {{../title}}' }) }))
    expect(findings(tree).problems[0]).toContain('is a second per-row condition')
  })

  it('draw a RecordsIterator and a Table without resource only in a list', () => {
    const tree = Page({ title: 'Board', children: [RecordsIterator({ children: 'x' }), Table({})] })
    expect(structureProblems(tree)).toEqual([
      '<Page> › <RecordsIterator>: draws the list around it: put it inside a ReferenceManyField, ReferenceArrayField or ArrayField',
      '<Page> › <Table>: "resource" is required, or put it inside a ReferenceManyField, ReferenceArrayField or ArrayField to draw that list',
    ])
  })

  it('check a Table in a list against the list’s resource, and leave its read to the list', () => {
    expect(findings(claims(Table({ columns: ['claimed_at', 'nope'] }))).problems).toEqual([
      '<Page> › <RecordCard resource="tasks"> › <ReferenceManyField reference="task_claims"> › <Table>: unknown column "nope" on task_claims',
    ])
    expect(structureProblems(page(claims(Table({ limit: 5 }))).tree)[0]).toContain('"limit" is the list\'s around it')
  })

  it('read an ArrayField’s text items as this, and its object items by key', () => {
    const tree = ArrayField({ source: 'labels', children: RecordsIterator({ children: [Field({ name: 'this' }), Field({ name: 'colour' }), Field({ name: 'title' })] }) })
    expect(findings(tree)).toEqual({
      problems: [],
      warnings: ['<Page> › <RecordCard resource="tasks"> › <ArrayField source="labels"> › <RecordsIterator> › <Field name="title">: "title" resolves to tasks; write this.title for an item\'s, if it has one'],
    })
    expect(findings(ArrayField({ source: 'title' })).problems).toEqual(['<Page> › <RecordCard resource="tasks"> › <ArrayField source="title">: source: "title" is a text field; it must be a JSON list'])
  })

  it('refuse an item of an ArrayField as a read’s value', () => {
    const tree = ArrayField({ source: 'labels', children: RecordsIterator({ children: ReferenceManyField({ reference: 'task_claims', target: 'status', source: 'this' }) }) })
    expect(findings(tree).problems[0]).toContain('is no stored field of a record, so a read cannot take it')
  })

  it('read a ReferenceArrayField from a JSON list of keys', () => {
    expect(findings(ReferenceArrayField({ source: 'worker_ids', reference: 'workers' })).problems).toEqual([])
    expect(findings(ReferenceArrayField({ source: 'title', reference: 'workers' })).problems).toEqual([
      '<Page> › <RecordCard resource="tasks"> › <ReferenceArrayField reference="workers" source="title">: source: "title" is a text field; it must be a JSON list of workers\'s keys',
    ])
  })

  it('check a ReferenceField’s relation, and the names inside it against its record', () => {
    const claim = (...children: LayoutNode[]) => claims(RecordsIterator({ children }))
    expect(findings(claim(ReferenceField({ source: 'worker', reference: 'workers', children: Field({ name: 'name' }) }))).problems).toEqual([])
    expect(findings(claim(ReferenceField({ source: 'worker', reference: 'tasks' }))).problems).toEqual([
      '<Page> › <RecordCard resource="tasks"> › <ReferenceManyField reference="task_claims"> › <RecordsIterator> › <ReferenceField reference="tasks" source="worker">: source: "worker" points at workers, not tasks',
    ])
  })

  it('leave out a list the caller cannot read, with what it holds', () => {
    const access = (hidden: string[]) => ({
      models: Object.fromEntries(Object.entries(models).filter(([name]) => !hidden.includes(name))),
      permissions: {},
      actions: () => new Set<string>(),
    })
    const tree = page(claims(RecordsIterator({ children: Field({ name: 'claimed_at' }) })), Field({ name: 'title' }))
    expect(JSON.stringify(prunePage(tree, [], access([]))?.tree)).toContain('ReferenceManyField')
    expect(JSON.stringify(prunePage(tree, [], access(['task_claims']))?.tree)).not.toContain('ReferenceManyField')
  })
})
