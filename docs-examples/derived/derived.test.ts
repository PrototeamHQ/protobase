import { describe, expect, it } from 'vitest'
import { objectives } from './config/objectives'

// The documentation shows these files; this keeps what it says about them true.

describe('the derived verdict', () => {
  it('goes into the objective\'s verdict and reads tasks', () => {
    expect(objectives.toModel().derived).toEqual([{ name: 'verdict', into: { resource: 'objectives', field: 'verdict' }, reads: ['tasks'] }])
  })
})
