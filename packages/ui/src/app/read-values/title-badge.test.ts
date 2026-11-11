import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { titleBadgeField } from './title-badge'

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer(), status: f.enum(['building', 'paused']), verdict: f.enum(['moving', 'stuck']).readOnly(), title: f.text() })
  .primaryKey((r) => r.id)
const model = objectives.toModel()
const plain = view<typeof objectives>('objectives').toModel()
const verdict = view<typeof objectives>('objectives').titleBadge((r) => r.verdict).toModel(model)
const all = () => true

describe('titleBadgeField', () => {
  it("is the view's titleBadge, even when the sidebar shows it", () => {
    expect(titleBadgeField(model, verdict, { status: 'building', verdict: 'stuck' }, ['verdict'], all)).toBe('verdict')
  })

  it('is an enum status without one, unless the sidebar shows it', () => {
    expect(titleBadgeField(model, plain, { status: 'building' }, [], all)).toBe('status')
    expect(titleBadgeField(model, plain, { status: 'building' }, ['status'], all)).toBeUndefined()
  })

  it('is none for an empty value, a field the reader cannot see or a field the model lacks', () => {
    expect(titleBadgeField(model, verdict, { verdict: null }, [], all)).toBeUndefined()
    expect(titleBadgeField(model, verdict, { verdict: '' }, [], all)).toBeUndefined()
    expect(titleBadgeField(model, verdict, { verdict: 'stuck' }, [], (name) => name !== 'verdict')).toBeUndefined()
    expect(titleBadgeField(model, { ...verdict, titleBadge: 'gone' }, { gone: 'x' }, [], all)).toBeUndefined()
  })
})
