import { describe, expect, it } from 'vitest'
import type { TaskState } from '@protobase/workflows'
import { offersWaiting, withStepType } from './task-fields'

const task = (Resource: string): TaskState => ({ Type: 'Task', Resource, End: true })

describe("a Task's form", () => {
  it('offers to wait for an outside result for a step type, but not for a custom step, which waits for its runner already', () => {
    expect(offersWaiting('app:http')).toBe(true)
    expect(offersWaiting('acme:ask')).toBe(true)
    expect(offersWaiting('custom:ocr:2')).toBe(false)
  })

  it('keeps a Task waiting as its step type changes, unless the new one is a custom step', () => {
    expect(withStepType(task('app:http.waitForTaskToken'), 'acme:ask').Resource).toBe('acme:ask.waitForTaskToken')
    expect(withStepType(task('app:http.waitForTaskToken'), 'custom:ocr:2').Resource).toBe('custom:ocr:2')
    expect(withStepType(task('custom:ocr:2'), 'app:http').Resource).toBe('app:http')
  })
})
