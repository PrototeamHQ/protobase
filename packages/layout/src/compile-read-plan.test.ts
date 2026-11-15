import { describe, expect, it } from 'vitest'
import { Action, CardRow, Chart, Field, Page, RecordCard, Show, Stat, Table } from './blocks'
import { component } from './component'
import { compileReadPlan } from './compile-read-plan'
import { elementAt } from './element-at'
import { RecordsIterator, ReferenceArrayField, ReferenceField, ReferenceManyField } from './list-blocks'
import { TextField } from './inline-fields'
import { field, model, nested } from './testing/models'
import type { LayoutNode } from './node'

const models = {
  ...nested,
  tasks: model('tasks', [field('id', 'integer', { readOnly: true }), field('title', 'text'), field('status', 'text'), field('waits', 'json'), field('owner_id', 'integer'), field('project_id', 'integer')]),
  projects: model('projects', [field('id', 'integer', { readOnly: true }), field('name', 'text')]),
}

const plan = (tree: LayoutNode, root?: string) => compileReadPlan(tree, { models, ...(root && { root }) })
const reads = (tree: LayoutNode, root?: string) => plan(tree, root).plan.reads

// Open tasks, the newest first, ten of them
const openTasks = (...children: LayoutNode[]) => CardRow({ resource: 'tasks', filter: "status = 'open'", sort: 'id desc', limit: 10, children })
const taskClaims = `related(task_id, tasks.id, (status = "open"), "id desc", 10)`

describe('compileReadPlan', () => {
  it('plans one read per data block, none waiting for another', () => {
    const tree = Page({ title: 'Home', children: [Stat({ label: 'Open', resource: 'tasks', filter: "status = 'open'" }), Table({ resource: 'workers', columns: ['name'] }), Chart({ resource: 'task_claims', groupBy: 'status' })] })
    expect(reads(tree)).toEqual([
      { block: '/children/0', kind: 'count', resource: 'tasks', filter: 'status = "open"', fields: ['id'], etag: false },
      { block: '/children/1', kind: 'list', resource: 'workers', pageSize: 10, fields: ['id', 'name'], etag: false },
      { block: '/children/2', kind: 'aggregate', resource: 'task_claims', groupBy: ['status'], etag: false },
    ])
  })

  it('derives the fields each read draws in its scope, its key included', () => {
    const tree = Page({ title: 'Tasks', children: [openTasks(Field({ source: 'title' }), TextField({ source: 'status', emptyText: 'Owner {{owner_id}}' }))] })
    expect(reads(tree)[0]!.fields).toEqual(['id', 'owner_id', 'status', 'title'])
  })

  it('ties a ReferenceManyField under a list to it with related() and reads perPage per record', () => {
    const tree = Page({ title: 'Tasks', children: [openTasks(ReferenceManyField({ reference: 'task_claims', target: 'task_id', perPage: 5, children: RecordsIterator({ children: Field({ source: 'claimed_at' }) }) }))] })
    expect(reads(tree)[1]).toEqual({
      block: '/children/0/children/0',
      kind: 'list',
      resource: 'task_claims',
      filter: taskClaims,
      orderBy: 'id desc',
      pageSize: 50,
      limitPer: { field: 'task_id', count: 5 },
      split: { field: 'task_id', source: 'this.id', parent: '/children/0' },
      fields: ['claimed_at', 'id', 'task_id'],
      etag: false,
    })
  })

  it('nests related() two levels deep, reading all the middle records of the outer ones', () => {
    const steps = ReferenceManyField({ reference: 'claim_steps', target: 'claim_id', children: RecordsIterator({ children: Field({ source: 'name' }) }) })
    const tree = Page({ title: 'Tasks', children: [openTasks(ReferenceManyField({ reference: 'task_claims', target: 'task_id', perPage: 5, children: RecordsIterator({ children: steps }) }))] })
    expect(reads(tree)[2]!.filter).toBe(`related(claim_id, task_claims.id, ${taskClaims})`)
  })

  it('plans a ReferenceField by the key a record holds and a ReferenceArrayField by its list of keys', () => {
    const tree = Page({ title: 'Tasks', children: [openTasks(ReferenceField({ source: 'owner_id', reference: 'workers', children: Field({ source: 'name' }) }), ReferenceArrayField({ source: 'waits', reference: 'tasks', perPage: 3, children: RecordsIterator({ children: Field({ source: 'title' }) }) }))] })
    const [tasks, owner, waits] = reads(tree)
    expect(tasks!.fields).toEqual(['id', 'owner_id', 'waits'])
    expect(owner).toMatchObject({ resource: 'workers', filter: 'related(id, tasks.owner_id, (status = "open"), "id desc", 10)', pageSize: 10, fields: ['id', 'name'] })
    expect(owner!.limitPer).toBeUndefined()
    expect(waits).toMatchObject({ resource: 'tasks', filter: 'related(id, tasks.waits, (status = "open"), "id desc", 10)', orderBy: 'id desc', pageSize: 30 })
    expect([owner!.split, waits!.split]).toEqual([{ field: 'id', source: 'owner_id', parent: '/children/0' }, { field: 'id', source: 'waits', parent: '/children/0' }])
  })

  it('names the read a nested read splits on, and the path its value comes from', () => {
    const steps = ReferenceManyField({ reference: 'claim_steps', target: 'claim_id', children: RecordsIterator({ children: Field({ source: 'name' }) }) })
    const tree = Page({ title: 'Tasks', children: [openTasks(ReferenceManyField({ reference: 'task_claims', target: 'task_id', perPage: 5, children: RecordsIterator({ children: steps }) }))] })
    expect(reads(tree).map((read) => read.split)).toEqual([undefined, { field: 'task_id', source: 'this.id', parent: '/children/0' }, { field: 'claim_id', source: 'this.id', parent: '/children/0/children/0' }])
  })

  it("rewrites a field of the page's own record to related() on it by its key, and keeps the key a slot", () => {
    const tree = Page({ title: 'Task', children: [Table({ resource: 'projects', filter: 'id = {{@root.project_id}}' }), Table({ resource: 'task_claims', filter: 'task_id = {{@root.id}}' })] })
    const [project, claims] = reads(tree, 'tasks')
    expect(project!.filter).toBe('related(id, tasks.project_id, (id = {{@root.id}}))')
    expect(claims!.filter).toBe('task_id = {{@root.id}}')
  })

  it('keeps a page parameter a slot, as a value or as a duration', () => {
    const tree = Page({ title: 'Claims', children: [Table({ resource: 'task_claims', filter: "claimed_at >= now() - {{@params.window}} AND status = '{{@params.state}}'" })] })
    expect(reads(tree)[0]!.filter).toBe('claimed_at >= now() - {{@params.window}} AND status = "{{@params.state}}"')
  })

  it('plans a block under Show, whose condition only decides what is drawn', () => {
    const tree = Page({ title: 'Tasks', children: [Show({ when: 'workers.count > 0', children: Table({ resource: 'workers' }) })] })
    expect(reads(tree)).toEqual([
      { block: '/children/0/children/0', kind: 'list', resource: 'workers', pageSize: 10, etag: false },
      { block: '/children/0', part: 'condition', kind: 'count', resource: 'workers', fields: ['id'], etag: false },
    ])
  })

  it('counts under a repeat with one aggregate grouped by the field it splits on', () => {
    const tree = Page({ title: 'Tasks', children: [openTasks(Stat({ label: 'Claims', resource: 'task_claims', filter: 'task_id = {{id}}' }))] })
    expect(reads(tree)[1]).toEqual({ block: '/children/0/children/0', kind: 'aggregate', resource: 'task_claims', filter: taskClaims, groupBy: ['task_id'], pageSize: 10, split: { field: 'task_id', source: 'id', parent: '/children/0' }, etag: false })
  })

  it('asks for ETags only for a read whose records an Action changes, reading every field', () => {
    const tree = Page({ title: 'Tasks', children: [openTasks(Field({ source: 'title' }), Action({ name: 'close' })), Table({ resource: 'workers', columns: ['name'] })] })
    const [tasks, workers] = reads(tree)
    expect(tasks).toMatchObject({ etag: true })
    expect(tasks!.fields).toBeUndefined()
    expect(workers).toMatchObject({ etag: false, fields: ['id', 'name'] })
  })

  it('plans a custom component that declares its reads, and lists one that does not outside the plan', () => {
    const Board = component<{ resource: string; filter: string; limit: number }>('Board', { reads: { resource: 'resource', filter: 'filter', limit: 'limit' } })
    const Clock = component('Clock')
    const tree = Page({ title: 'Home', children: [Board({ resource: 'tasks', filter: "status = 'open'", limit: 20 }), Clock({})] })
    expect(plan(tree).plan).toEqual({
      reads: [{ block: '/children/0', kind: 'list', resource: 'tasks', filter: 'status = "open"', pageSize: 20, etag: false }],
      outside: [{ block: '/children/1', type: 'Clock' }],
    })
  })

  it('reads as many records as one read holds for a custom component whose reads name no limit, whatever props it has', () => {
    const Board = component<{ resource: string; limit: number }>('Board', { reads: { resource: 'resource' } })
    expect(reads(Page({ title: 'Home', children: [Board({ resource: 'tasks', limit: 1 })] }))[0]!.pageSize).toBe(500)
  })

  it("takes no chosen row from a custom component's own select prop", () => {
    const Board = component<{ resource: string; select: string }>('Board', { reads: { resource: 'resource' } })
    expect(reads(Page({ title: 'Home', children: [Board({ resource: 'tasks', select: 'compact' })] })).map((read) => read.part)).toEqual([undefined])
  })

  it("plans each of a custom component's several reads as a part named by its resource prop, with the fields its props name", () => {
    const Graph = component<{ nodes: string; edges: string; label: string; group: string; from: string; to: string }>('Graph', {
      reads: [
        { resource: 'nodes', fields: ['label', 'group'] },
        { resource: 'edges', fields: ['from', 'to'] },
      ],
    })
    const tree = Page({ title: 'Map', children: [Graph({ nodes: 'tasks', edges: 'task_claims', label: 'title', group: 'project_id', from: 'task_id', to: 'worker_id' })] })
    expect(plan(tree).plan).toEqual({
      reads: [
        { block: '/children/0', part: 'nodes', kind: 'list', resource: 'tasks', pageSize: 500, fields: ['id', 'project_id', 'title'], etag: false },
        { block: '/children/0', part: 'edges', kind: 'list', resource: 'task_claims', pageSize: 500, fields: ['id', 'task_id', 'worker_id'], etag: false },
      ],
      outside: [],
    })
  })

  it("reads the record a custom component's declared select chose by its key, and its children's fields there", () => {
    const Graph = component<{ nodes: string; label: string; select: string }>('Graph', { reads: [{ resource: 'nodes', fields: 'label', select: 'select' }] })
    const tree = Page({ title: 'Map', children: [Graph({ nodes: 'tasks', label: 'title', select: 'task', children: Field({ source: 'status' }) })] })
    const planned = reads(tree)
    const own = planned.find((read) => read.part === 'nodes')
    const chosen = planned.find((read) => read.part === 'chosen')
    expect(own).toMatchObject({ part: 'nodes', fields: ['id', 'title'] })
    expect(chosen).toMatchObject({ block: '/children/0', part: 'chosen', resource: 'tasks', filter: 'id = {{@params.task}}', pageSize: 1, fields: ['id', 'status'] })
  })

  it('warns when the records around a nested list times its page are more than one read holds', () => {
    const steps = ReferenceManyField({ reference: 'claim_steps', target: 'claim_id', children: RecordsIterator({ children: Field({ source: 'name' }) }) })
    const tree = Page({ title: 'Tasks', children: [openTasks(ReferenceManyField({ reference: 'task_claims', target: 'task_id', perPage: 5, children: RecordsIterator({ children: steps }) }))] })
    const { plan: planned, warnings } = plan(tree)
    expect(planned.reads[2]).toMatchObject({ pageSize: 500, limitPer: { field: 'claim_id', count: 25 } })
    expect(warnings).toEqual(['<ReferenceManyField reference="claim_steps">: 50 records around it × 25 each is more than the 500 records one read holds, so some may show fewer; lower its limit or the one around it'])
    expect(plan(Page({ title: 'Tasks', children: [openTasks(Field({ source: 'title' }))] })).warnings).toEqual([])
  })

  it('keeps a page parameter inside a longer key a slot', () => {
    const tree = Page({ title: 'Tasks', children: [RecordCard({ resource: 'workers', recordKey: 'w-{{@params.worker}}' })] })
    expect(reads(tree)[0]!.filter).toBe('id = "w-{{@params.worker}}"')
  })

  it("reads a RecordCard's one record by its key, and the record a Table's select chose by the address", () => {
    const tree = Page({ title: 'Tasks', children: [RecordCard({ resource: 'tasks', recordKey: '7', children: Field({ source: 'title' }) }), Table({ resource: 'workers', select: 'worker', children: Field({ source: 'name' }) })] })
    const [card, , chosen] = reads(tree)
    expect(card).toMatchObject({ filter: 'id = 7', pageSize: 1, fields: ['id', 'title'] })
    // Its key names its record whatever its filter says, as the record's own read does
    expect(reads(Page({ title: 'Task', children: [RecordCard({ resource: 'tasks', recordKey: '7', filter: "status = 'open'" })] }))[0]!.filter).toBe('id = 7')
    expect(chosen).toEqual({ block: '/children/1', part: 'chosen', kind: 'list', resource: 'workers', filter: 'id = {{@params.worker}}', pageSize: 1, fields: ['id', 'name'], etag: false })
  })
})

describe('elementAt', () => {
  it('finds the element a read names by its pointer', () => {
    const tree = Page({ title: 'Tasks', actions: [Action({ name: 'a' }), Action({ name: 'b' })], children: [openTasks(Field({ source: 'title' }))] })
    expect(elementAt(tree, '/children/0/children/0')?.props.source).toBe('title')
    expect(elementAt(tree, '/props/actions/1')?.props.name).toBe('b')
    expect(elementAt(tree, '/children/4')).toBeUndefined()
  })
})
