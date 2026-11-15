import { describe, expect, it } from 'vitest'
import { Action, Card, Field, Page, Show, Table, Thread } from './blocks'
import { component } from './component'
import { SelectInput } from './page-params'
import { RecordsIterator, ReferenceManyField } from './list-blocks'
import { pruneRecordBlocks, recordBlocksFindings } from './record-blocks'
import { field, model, nested } from './testing/models'

// A task's record page holding block trees: its claims, its notes, and the project and owner its fields point at

const models = {
  ...nested,
  tasks: model('tasks', [field('id', 'integer', { readOnly: true }), field('title', 'text'), field('status', 'text'), field('owner_id', 'integer')]),
  owners: model('owners', [field('id', 'integer', { readOnly: true }), field('name', 'text')]),
  task_notes: model('task_notes', [field('id', 'integer', { readOnly: true }), field('task_id', 'integer'), field('noted_at', 'timestamp'), field('body', 'text')]),
}

const input = { models, actions: (resource: string) => new Set(resource === 'tasks' ? ['close'] : []) }
const findings = (tree: Parameters<typeof recordBlocksFindings>[0]) => recordBlocksFindings(tree, 'tasks', input)
const notes = (filter: string) => Thread({ resource: 'task_notes', filter, time: 'noted_at', text: 'body' })

describe('recordBlocksFindings', () => {
  it("reads the page's record as @root, and as the record a bare name reaches last", () => {
    const tree = Card({ title: '{{@root.title}}', children: [Field({ source: 'status' }), Show({ when: "status = 'open'", children: Action({ name: 'close' }) }), notes('task_id = {{@root.id}}')] })
    expect(findings(tree)).toEqual({ problems: [], warnings: [] })
  })

  it('fails on a typo, naming the root resource and the closest field', () => {
    expect(findings(Card({ title: '{{@root.titel}}' })).problems).toEqual(['<Card>: title: "@root.titel": "titel" is no field of tasks (@root); did you mean title?'])
    expect(findings(Field({ source: 'titel' })).problems).toEqual(['<Field source="titel">: "titel" is no field of tasks (@root); did you mean title?'])
  })

  it('warns of a name a nearer record shadows, saying how to reach the page record', () => {
    const tree = ReferenceManyField({ reference: 'task_claims', target: 'task_id', children: RecordsIterator({ children: Field({ source: 'status' }) }) })
    expect(findings(tree).warnings).toEqual(['<ReferenceManyField reference="task_claims"> › <RecordsIterator> › <Field source="status">: "status" resolves to task_claims; write ../status or @root.status for the one of tasks (@root)'])
  })

  it('refuses a block or custom component that chooses a row into the address', () => {
    const Graph = component<{ nodes: string; chosen: string }>('Graph', { reads: { resource: 'nodes', select: 'chosen' } })
    expect(findings(Card({ children: [Table({ resource: 'owners', select: 'owner' }), Graph({ nodes: 'owners', chosen: 'owner' })] })).problems).toEqual([
      `<Card> › <Table resource="owners">: <Table> chooses a row into the page's own address with "select", and a record page's address is the record's`,
      `<Card> › <Graph>: <Graph> chooses a row into the page's own address with "select", and a record page's address is the record's`,
    ])
  })

  it('refuses a Page, page parameters and tabs of its own', () => {
    expect(findings(Page({ title: 'Task' })).problems).toEqual(["<Page>: <Page> is a composed page of its own; a record page's tree is the blocks inside one"])
    expect(findings(Card({ children: SelectInput({ source: 'window', choices: [{ id: '1h', name: 'Hour' }] }) })).problems).toEqual([
      `<Card> › <SelectInput source="window">: <SelectInput> sets the page's own address, and a record page's address is the record's; use l.tab for tabs`,
    ])
  })
})

describe('pruneRecordBlocks', () => {
  const access = (hidden: string[] = []) => ({
    models: { ...models, task_notes: { ...models.task_notes, fields: Object.fromEntries(Object.entries(models.task_notes.fields).filter(([name]) => !hidden.includes(name))) } },
    permissions: {},
    actions: input.actions,
  })

  it("plans the tree's reads with the page record's key from the address, never reading the record first", () => {
    const tree = Card({ children: [notes('task_id = {{@root.id}}'), Table({ resource: 'owners', filter: 'id = {{@root.owner_id}}', columns: ['name'] })] })
    const { reads } = pruneRecordBlocks(tree, 'tasks', access())!
    expect(reads.reads.map((read) => [read.resource, read.filter])).toEqual([
      ['task_notes', 'task_id = {{@root.id}}'],
      ['owners', 'related(id, tasks.owner_id, (id = {{@root.id}}))'],
    ])
  })

  it('leaves out what the caller cannot read, and the whole tree when nothing is left', () => {
    expect(pruneRecordBlocks(notes('task_id = {{@root.id}}'), 'tasks', access(['body']))).toBeUndefined()
    const kept = pruneRecordBlocks(Card({ children: [Field({ source: 'title' }), notes('task_id = {{@root.id}}')] }), 'tasks', access(['body']))!
    expect(kept.tree.children.map((child) => typeof child !== 'string' && child.type)).toEqual(['Field'])
  })
})
