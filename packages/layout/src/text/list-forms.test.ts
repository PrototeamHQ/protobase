import { describe, expect, it } from 'vitest'
import { Field, Page } from '../blocks'
import { Text } from '../elements'
import { ArrayField, RecordsIterator, ReferenceField, ReferenceManyField } from '../list-blocks'
import type { LayoutNode } from '../node'
import { renderText } from './render-text'

// A task's claims, each with its steps, as the caller read them
const task = { id: 7, title: 'Ship it', labels: ['urgent', 'small'], checks: [{ name: 'lint' }, { name: 'types' }] }
const claims = [{ id: 1, worker: 'Ann' }, { id: 2, worker: 'Bo' }]
const steps: Record<number, Array<{ name: string }>> = { 1: [{ name: 'plan' }, { name: 'build' }], 2: [] }

const records = (node: LayoutNode, record: Record<string, unknown> | undefined) => {
  if (node.props.reference === 'task_claims') return claims
  if (node.props.reference === 'claim_steps') return steps[record?.id as number]
  if (node.props.reference === 'workers') return [{ id: 3, name: 'Ann' }]
}

const nestedList = ReferenceManyField({
  reference: 'task_claims',
  target: 'task_id',
  children: RecordsIterator({
    children: [
      Field({ name: 'worker' }),
      ReferenceManyField({ reference: 'claim_steps', target: 'claim_id', empty: 'No steps yet', children: RecordsIterator({ children: Field({ name: 'name', label: false }) }) }),
    ],
  }),
})

describe('text forms of lists', () => {
  it('reads a two-level nested list once per record, an empty one as its empty text', () => {
    expect(renderText(Page({ title: 'Ship it', children: nestedList }), { record: task, records })).toBe('# Ship it\n\n**worker**: Ann\n\nplan\n\nbuild\n\n**worker**: Bo\n\nNo steps yet')
  })

  it('links to the related records while the text does not have them', () => {
    expect(renderText(nestedList, { record: task })).toBe('[task\\_claims](/task_claims?filter=task_id+%3D+7)')
    expect(renderText(ReferenceManyField({ reference: 'task_claims', target: 'task_id', sort: { field: 'id', order: 'DESC' } }))).toBe('[task\\_claims](/task_claims?order_by=id+desc)')
  })

  it('reads an ArrayField’s text items as this, and its object items by key', () => {
    expect(renderText(ArrayField({ source: 'labels', children: RecordsIterator({ children: Field({ name: 'this', label: false }) }) }), { record: task })).toBe('urgent\n\nsmall')
    expect(renderText(ArrayField({ source: 'checks', children: RecordsIterator({ children: Field({ name: 'name', label: false }) }) }), { record: task })).toBe('lint\n\ntypes')
  })

  it('reads a ReferenceField as a link to its record, its children in that record', () => {
    const claim = { id: 1, worker_id: 3 }
    expect(renderText(ReferenceField({ source: 'worker_id', reference: 'workers' }), { record: claim })).toBe('[3](/workers/3)')
    expect(renderText(ReferenceField({ source: 'worker_id', reference: 'workers', children: Text({ children: 'By' }) }), { record: claim })).toBe('[By](/workers/3)')
    expect(renderText(ReferenceField({ source: 'worker_id', reference: 'workers', link: false, children: Field({ name: 'name', label: false }) }), { record: claim, records })).toBe('Ann')
    expect(renderText(ReferenceField({ source: 'worker_id', reference: 'workers', emptyText: 'Nobody' }), { record: { id: 2 } })).toBe('Nobody')
  })
})
