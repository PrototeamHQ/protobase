import { describe, expect, it } from 'vitest'
import { workflowTraceRevision } from './workflow-trace-revision'

describe('workflowTraceRevision', () => {
  it('is the same for the same steps, and changes when they come in another order or one of them changes', async () => {
    const a = { scope: '', seq: 0, state: 'A' }
    const b = { scope: '', seq: 1, state: 'B' }
    expect(await workflowTraceRevision([a, b])).toBe(await workflowTraceRevision([{ ...a }, { ...b }]))
    expect(await workflowTraceRevision([a, b])).toMatch(/^[0-9a-f]{64}$/)
    expect(await workflowTraceRevision([b, a])).not.toBe(await workflowTraceRevision([a, b]))
    expect(await workflowTraceRevision([a, { ...b, state: 'C' }])).not.toBe(await workflowTraceRevision([a, b]))
  })
})
