import { describe, expect, it } from 'vitest'
import { firstControl } from './first-control'

const control = (name: string, attributes: { disabled?: boolean; 'aria-disabled'?: string } = {}) => ({
  name,
  disabled: attributes.disabled,
  getAttribute: (attribute: string) => (attribute === 'aria-disabled' ? (attributes['aria-disabled'] ?? null) : null),
})
type Control = ReturnType<typeof control>

const card = (buttons: Control[], link = control('title')) => ({
  querySelectorAll: (selectors: string) => (selectors === 'button' ? buttons : []),
  querySelector: (selectors: string) => (selectors === 'a' ? link : null),
})

describe('firstControl', () => {
  it('takes the first button', () => expect(firstControl(card([control('clear'), control('snooze')]))?.name).toBe('clear'))
  it('passes over a disabled button', () =>
    expect(firstControl(card([control('clear', { disabled: true }), control('snooze')]))?.name).toBe('snooze'))
  it('passes over a button disabled for assistive technology', () =>
    expect(firstControl(card([control('clear', { 'aria-disabled': 'true' }), control('snooze')]))?.name).toBe('snooze'))
  it('takes the title link when no button is enabled', () =>
    expect(firstControl(card([control('clear', { disabled: true })]))?.name).toBe('title'))
  it('takes the title link on a card without buttons', () => expect(firstControl(card([]))?.name).toBe('title'))
})
