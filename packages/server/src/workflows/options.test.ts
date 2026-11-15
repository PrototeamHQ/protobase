import { describe, expect, it } from 'vitest'
import { workflowsCustomStepsOn, workflowsStorageOn, workflowsTraceMode } from './options'

describe('workflowsTraceMode', () => {
  it('keeps a trace of every run by default, and stops startup on a value other than all, failed or none', () => {
    expect(workflowsTraceMode({})).toBe('all')
    expect(workflowsTraceMode({ trace: 'failed' })).toBe('failed')
    expect(() => workflowsTraceMode({ trace: 'failing' as 'failed' })).toThrow('workflows.trace is "failing": use all, failed or none')
  })
})

describe('workflowsStorageOn', () => {
  it('is on only for a storage object, so false or null neither adds nor requires the table', () => {
    expect(workflowsStorageOn({ storage: {} })).toBe(true)
    expect(workflowsStorageOn({})).toBe(false)
    expect(workflowsStorageOn({ storage: false as never })).toBe(false)
    expect(workflowsStorageOn({ storage: null as never })).toBe(false)
  })
})

describe('workflowsCustomStepsOn', () => {
  it('is on only for true, off by default, and stops startup on a value other than true or false', () => {
    expect(workflowsCustomStepsOn({ customSteps: true })).toBe(true)
    expect(workflowsCustomStepsOn({ customSteps: false })).toBe(false)
    expect(workflowsCustomStepsOn({})).toBe(false)
    expect(() => workflowsCustomStepsOn({ customSteps: 'yes' as never })).toThrow('workflows.customSteps is "yes": use true or false')
    expect(() => workflowsCustomStepsOn({ customSteps: null as never })).toThrow('workflows.customSteps is null: use true or false')
    expect(() => workflowsCustomStepsOn({ customSteps: {} as never })).toThrow('use true or false')
  })
})
