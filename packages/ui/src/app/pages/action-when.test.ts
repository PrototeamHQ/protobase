import { describe, expect, it } from 'vitest'
import type { ActionModel } from '@protobase/schema'
import { actionApplies } from './action-when'

const reboot: ActionModel = { name: 'reboot', label: 'Reboot', bulk: true, when: "status = 'running' AND locked = false" }

describe('actionApplies', () => {
  it('holds for the records its condition holds for', () => {
    expect(actionApplies(reboot, { status: 'running', locked: false })).toBe(true)
    expect(actionApplies(reboot, { status: 'stopped', locked: false })).toBe(false)
    expect(actionApplies(reboot, { status: 'running', locked: true })).toBe(false)
  })

  it('applies an action without a condition everywhere, and one with a condition to no missing record', () => {
    expect(actionApplies({ name: 'x', label: 'X', bulk: false }, undefined)).toBe(true)
    expect(actionApplies(reboot, undefined)).toBe(false)
  })

  it('never holds a condition that does not parse', () => {
    expect(actionApplies({ ...reboot, when: 'status = ' }, { status: 'running' })).toBe(false)
  })
})
