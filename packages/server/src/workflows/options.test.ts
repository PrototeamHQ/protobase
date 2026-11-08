import { describe, expect, it } from 'vitest'
import { workflowsTraceMode } from './options'

describe('workflowsTraceMode', () => {
  it('keeps a trace of every run by default, and stops startup on a value other than all, failed or none', () => {
    expect(workflowsTraceMode({})).toBe('all')
    expect(workflowsTraceMode({ trace: 'failed' })).toBe('failed')
    expect(() => workflowsTraceMode({ trace: 'failing' as 'failed' })).toThrow('workflows.trace is "failing": use all, failed or none')
  })
})
