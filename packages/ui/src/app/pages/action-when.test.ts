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

  it('shows an action on isNull(field) while the field is empty, and on NOT isNull(field) once it is set', () => {
    const production: ActionModel = { name: 'set_mail_server', label: 'Set mail server', bulk: false, when: 'isNull(parent_id)' }
    expect(actionApplies(production, { parent_id: null })).toBe(true)
    expect(actionApplies(production, {})).toBe(true)
    expect(actionApplies(production, { parent_id: 7 })).toBe(false)
    const preview = { ...production, when: 'NOT isNull(parent_id)' }
    expect(actionApplies(preview, { parent_id: null })).toBe(false)
    expect(actionApplies(preview, { parent_id: 7 })).toBe(true)
  })

  it('never holds a condition that does not parse', () => {
    expect(actionApplies({ ...reboot, when: 'status = ' }, { status: 'running' })).toBe(false)
  })
})
