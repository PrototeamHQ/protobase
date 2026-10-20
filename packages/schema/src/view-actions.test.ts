import { describe, expect, it } from 'vitest'
import { actions as a } from './view-actions'

describe('action conditions and variants', () => {
  it('keeps the condition, the disabled reason and the danger variant', () => {
    expect(a.update('reboot', { label: 'Reboot', icon: 'restart', when: "status = 'running'", set: { status: 'rebooting' }, bulk: true })).toEqual({
      name: 'reboot',
      label: 'Reboot',
      icon: 'restart',
      bulk: true,
      when: "status = 'running'",
      run: { kind: 'update', values: { status: 'rebooting' } },
    })
    expect(a.action('force_off', { label: 'Force off', when: "status = 'running'", otherwise: 'disable', reason: 'The VM is not running', variant: 'danger' })).toEqual({
      name: 'force_off',
      label: 'Force off',
      bulk: false,
      when: "status = 'running'",
      otherwise: 'disable',
      reason: 'The VM is not running',
      variant: 'danger',
    })
  })

  it('leaves out an explicit hide, the default', () => {
    expect(a.remove('drop', { label: 'Drop', when: "status = 'stopped'", otherwise: 'hide' })).toEqual({ name: 'drop', label: 'Drop', bulk: false, when: "status = 'stopped'", run: { kind: 'delete' } })
  })

  it('refuses a fallback without a condition, a disabled button without a reason and a reason it never shows', () => {
    expect(() => a.action('x', { label: 'X', otherwise: 'disable', reason: 'No' })).toThrow('Action "x": "otherwise" and "reason" need a "when" condition')
    expect(() => a.action('x', { label: 'X', when: ' ' })).toThrow('Action "x": "when" is empty')
    expect(() => a.action('x', { label: 'X', when: 'done', otherwise: 'disable' })).toThrow('Action "x": a button disabled by "when" needs a "reason"')
    expect(() => a.action('x', { label: 'X', when: 'done', reason: 'Not done' })).toThrow(`Action "x": "reason" shows only with otherwise: 'disable'`)
  })
})
