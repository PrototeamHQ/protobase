import { describe, expect, it } from 'vitest'
import { workflowsCustomStepsOn, workflowsRunnerSettings, workflowsStorageOn, workflowsTraceMode } from './options'

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

describe('workflowsRunnerSettings', () => {
  it('holds a claim 50 seconds, a job 30 without a heartbeat, and waits 5 and 1 for a hotter runner by default, each in milliseconds', () => {
    expect(workflowsRunnerSettings({})).toEqual({ claimMs: 50_000, leaseMs: 30_000, coldWaitMs: 5000, warmWaitMs: 1000 })
    expect(workflowsRunnerSettings({ runners: { claimSeconds: 0.5, coldWaitSeconds: 0 } })).toEqual({ claimMs: 500, leaseMs: 30_000, coldWaitMs: 0, warmWaitMs: 1000 })
  })

  it('stops startup on a setting it does not know, a time of 0 or less, or one that is no number', () => {
    expect(() => workflowsRunnerSettings({ runners: { pollSeconds: 5 } as never })).toThrow('workflows.runners.pollSeconds is not a setting; use claimSeconds, leaseSeconds, coldWaitSeconds, warmWaitSeconds')
    expect(() => workflowsRunnerSettings({ runners: { leaseSeconds: 0 } })).toThrow('workflows.runners.leaseSeconds is 0: use a number of seconds above 0')
    expect(() => workflowsRunnerSettings({ runners: { warmWaitSeconds: -1 } })).toThrow('workflows.runners.warmWaitSeconds is -1: use a number of seconds of 0 or more')
    expect(() => workflowsRunnerSettings({ runners: { claimSeconds: '50' as never } })).toThrow('workflows.runners.claimSeconds is "50"')
  })
})
