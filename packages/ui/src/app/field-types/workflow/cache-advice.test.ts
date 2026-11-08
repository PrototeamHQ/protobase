import { describe, expect, it } from 'vitest'
import type { WorkflowTypeList } from '@protobase/client'
import type { TaskState } from '@protobase/workflows'
import { cacheForcedAgainst, cacheSwitch } from './cache-advice'

const step = (id: string, cache?: NonNullable<WorkflowTypeList['step_types'][number]['cache']>) => ({ id, kind: 'step', label: id, description: '', input: {}, available: true, ...(cache && { cache }) })
const types: WorkflowTypeList = {
  step_types: [step('a:hidden', { choice: 'hidden' }), step('a:switch', { choice: 'switch', default: true }), step('a:force', { choice: 'force' }), step('a:against', { choice: 'discouraged', disclaimer: 'Goes stale.' }), step('a:plain')],
  triggers: [],
}
const task = (Resource: string, Cache?: boolean): TaskState => ({ Type: 'Task', Resource, End: true, ...(Cache !== undefined && { Cache }) })

describe('the cache advice in the editor', () => {
  it('offers no switch for a hidden cache, and one for every other type, a type without a cache included', () => {
    expect(cacheSwitch(task('a:hidden'), types)).toBeUndefined()
    expect(cacheSwitch(task('a:switch'), types)).toMatchObject({ on: true, forces: false, offValue: false })
    expect(cacheSwitch(task('a:switch', false), types)?.on).toBe(false)
    expect(cacheSwitch(task('a:force'), types)).toMatchObject({ on: false, forces: true, offValue: undefined })
    expect(cacheSwitch(task('a:force', true), types)?.on).toBe(true)
    expect(cacheSwitch(task('a:plain', true), types)?.on).toBe(true)
    expect(cacheSwitch(task('a:against'), types)).toMatchObject({ on: false, disclaimer: 'Goes stale.' })
  })

  it('marks a step only when the workflow forced the cache on against its advice', () => {
    expect(cacheForcedAgainst(task('a:against', true), types)).toBe(true)
    expect(cacheForcedAgainst(task('a:against'), types)).toBe(false)
    expect(cacheForcedAgainst(task('a:force', true), types)).toBe(false)
    expect(cacheForcedAgainst({ Type: 'Pass', End: true }, types)).toBe(false)
  })
})
