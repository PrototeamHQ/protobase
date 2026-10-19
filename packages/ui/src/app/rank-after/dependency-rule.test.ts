import { describe, expect, it } from 'vitest'
import type { ResourceModel } from '@protobase/schema'
import { allowedDrop } from '../hand-order/drop-rule'
import { dependencyRule } from './dependency-rule'

const model = { name: 'tasks', primaryKey: ['id'], fields: { id: { name: 'id', type: 'integer' } } } as unknown as ResourceModel
const tasks = [1, 2, 3, 4].map((id) => ({ id }))
const bound = (key: string, title: string) => ({ key, rank: null, title })

describe('dependencyRule', () => {
  it('drops a record below the records it depends on, saying which', () => {
    const rule = dependencyRule(model, { after: [bound('2', 'Fix the clamp')], before: [] }, 'Order pads')
    expect(allowedDrop(tasks, 3, 0, rule)).toEqual({ to: 2, reason: 'Order pads depends on Fix the clamp.' })
    expect(allowedDrop(tasks, 3, 2, rule)).toEqual({ to: 2 })
  })

  it('keeps a record above those that depend on it, and leaves it where it was when nothing below fits', () => {
    const rule = dependencyRule(model, { after: [], before: [bound('3', 'Order pads')] }, 'Fix the clamp')
    expect(allowedDrop(tasks, 0, 3, rule)).toEqual({ to: 0, reason: 'Order pads depends on Fix the clamp.' })
    expect(allowedDrop(tasks, 0, 1, rule)).toEqual({ to: 1 })
  })

  it('ignores records the list does not hold', () => {
    expect(allowedDrop(tasks, 3, 0, dependencyRule(model, { after: [bound('9', 'Elsewhere')], before: [bound('8', 'Other')] }, 'Order pads'))).toEqual({ to: 0 })
  })
})
