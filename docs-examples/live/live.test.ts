import { describe, expect, it } from 'vitest'
import { tasks } from './tasks'
import { thread } from './thread'

// The documentation shows this file; this keeps what it says about it true.

describe('live tasks', () => {
  it('refreshes open pages when a task changes', () => {
    expect(tasks.toModel().live).toBe(true)
  })

  it('refreshes an open thread when a message or reply changes', () => {
    expect(thread.toModel()).toMatchObject({ live: true, liveReads: ['messages', 'replies'] })
  })
})
