import { describe, expect, it } from 'vitest'
import { textValue, valueText } from './value-text'

describe('value text', () => {
  it('writes text and expressions without quotes, and other values as JSON', () => {
    expect(textValue('ops@example.com')).toBe('ops@example.com')
    expect(textValue('{% $states.input.owner %}')).toBe('{% $states.input.owner %}')
    expect(textValue('{"status": "paid"}')).toEqual({ status: 'paid' })
    expect(textValue('["a@example.com", "b@example.com"]')).toEqual(['a@example.com', 'b@example.com'])
    expect(textValue('42')).toBe(42)
    expect(textValue('{"status": ')).toBe('{"status": ')
    expect(textValue('  ')).toBeUndefined()
  })

  it('shows each value as the text that writes it again', () => {
    for (const value of ['ops@example.com', '{% $x %}', { status: 'paid' }, ['a'], 42, true]) expect(textValue(valueText(value))).toEqual(value)
    expect(valueText(undefined)).toBe('')
  })
})
