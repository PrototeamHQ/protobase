import { describe, expect, it } from 'vitest'
import { tasks } from './tasks'

// The documentation shows this file; this keeps what it says about it true.

describe('live tasks', () => {
  it('refreshes open pages when a task changes', () => {
    expect(tasks.toModel().live).toBe(true)
  })
})
