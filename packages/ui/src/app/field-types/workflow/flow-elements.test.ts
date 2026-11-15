import { describe, expect, it } from 'vitest'
import { triggerId } from './definition'
import { flowId, graphId, isPureFlowId } from './flow-elements'
import { makeId } from './pins/pure-ids'

describe('canvas node ids', () => {
  it("keeps a state named like a Make a state, and a Make's id as it is", () => {
    expect(flowId('make:Report')).toBe('state:make:Report')
    expect(isPureFlowId(flowId('make:Report'))).toBe(false)
    expect(graphId(flowId('make:Report'))).toBe('make:Report')
    expect(isPureFlowId(makeId('Save', 'data'))).toBe(true)
    expect(graphId(makeId('Save', 'data'))).toBe(makeId('Save', 'data'))
    expect(isPureFlowId(flowId(triggerId))).toBe(false)
    expect(graphId(flowId(triggerId))).toBe(triggerId)
  })
})
