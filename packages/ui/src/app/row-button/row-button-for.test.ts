import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { rowButtonFor } from './row-button-for'

const holds = resource('holds')
  .table('holds')
  .fields({ id: f.integer(), task_id: f.relation('tasks'), verb: f.text(), state: f.enum(['needs_review', 'waiting']) })
  .primaryKey((r) => r.id)
const model = holds.toModel()
const holdsView = view<typeof holds>('holds')
  .fields((r) => ({ state: r.state.valueLabels({ needs_review: 'Review' }) }))
  .toModel()

const review = { label: 'Open', to: { kind: 'record' as const, resource: 'tasks', key: '{task_id}', tab: 'Review' } }

describe('rowButtonFor', () => {
  it("opens the address the row's fields name", () => {
    expect(rowButtonFor(review, model, holdsView, { id: 1, task_id: 7, verb: 'Approve' })).toEqual({ label: 'Open', to: { kind: 'record', resource: 'tasks', key: '7', tab: 'Review' } })
  })

  it('shows no button on a row without a value for a field it names', () => {
    expect(rowButtonFor(review, model, holdsView, { id: 1, task_id: null })).toBeUndefined()
    expect(rowButtonFor({ ...review, label: '{verb}' }, model, holdsView, { id: 1, task_id: 7, verb: '' })).toBeUndefined()
  })

  it("takes the label from the row's fields, an enum value by its label", () => {
    expect(rowButtonFor({ ...review, label: '{verb}' }, model, holdsView, { id: 1, task_id: 7, verb: 'Approve' })?.label).toBe('Approve')
    expect(rowButtonFor({ ...review, label: '{state}' }, model, holdsView, { id: 1, task_id: 7, state: 'needs_review' })?.label).toBe('Review')
  })
})
