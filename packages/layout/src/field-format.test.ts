import { describe, expect, it } from 'vitest'
import { booleanFieldText, dateFieldText, isEmptyFieldValue, numberFieldText, safeFieldUrl, textFieldText } from './field-format'

const now = Date.parse('2026-11-14T12:00:00Z')
const relative = (seconds: number) => `${seconds}s`
const date = (value: unknown, props = {}) => dateFieldText(value, props, { locale: 'en-US', now, relative })

describe('field values as react-admin formats them', () => {
  it('shows a date alone by default, a date-only value on its own day', () => {
    expect(date('2026-02-15')).toBe('2/15/2026')
    expect(date('2026-02-15T10:30:00Z', { options: { timeZone: 'UTC' } })).toBe('2/15/2026')
  })

  it('shows the time with showTime, and the time alone without showDate', () => {
    expect(date('2026-02-15T10:30:00Z', { showTime: true, options: { timeZone: 'UTC' } })).toBe('2/15/2026, 10:30:00 AM')
    expect(date('2026-02-15T10:30:00Z', { showTime: true, showDate: false, options: { timeZone: 'UTC' } })).toBe('10:30:00 AM')
  })

  it('formats a date with Intl options and locales', () => {
    expect(date('2026-02-15', { locales: 'nl-NL', options: { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } })).toBe('15 februari 2026')
  })

  it('counts a relative date from now', () => {
    expect(date('2026-11-14T11:00:00Z', { format: 'relative' })).toBe('3600s')
  })

  it('formats a number with currency options, a numeric string as its number', () => {
    expect(numberFieldText(1200.5, { options: { style: 'currency', currency: 'EUR' } }, 'en-US')).toBe('€1,200.50')
    expect(numberFieldText('1200.5', { locales: 'nl-NL' })).toBe('1.200,5')
    expect(numberFieldText('n/a', {})).toBe('n/a')
  })

  it('words a boolean by its labels, else the client’s', () => {
    expect(booleanFieldText(true, {}, { yes: 'Yes', no: 'No' })).toBe('Yes')
    expect(booleanFieldText(false, { valueLabelFalse: 'Open' }, { yes: 'Yes', no: 'No' })).toBe('Open')
  })

  it('takes empty as each react-admin component does', () => {
    expect(isEmptyFieldValue('BooleanField', null)).toBe(true)
    expect(isEmptyFieldValue('BooleanField', false)).toBe(false)
    expect(isEmptyFieldValue('TextField', '')).toBe(true)
    expect(isEmptyFieldValue('TextField', 0)).toBe(false)
    expect(isEmptyFieldValue('NumberField', '')).toBe(false)
    expect(isEmptyFieldValue('NumberField', undefined)).toBe(true)
  })

  it('shows a value that is no text as its string, an object as JSON', () => {
    expect(textFieldText(42)).toBe('42')
    expect(textFieldText({ a: 1 })).toBe('{"a":1}')
  })

  it('links only to an address that runs no code', () => {
    expect(safeFieldUrl('https://example.com')).toBe('https://example.com')
    expect(safeFieldUrl('mailto:a@example.com')).toBe('mailto:a@example.com')
    expect(safeFieldUrl('/tasks/1')).toBe('/tasks/1')
    expect(safeFieldUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeFieldUrl(' \tJava\nScript:alert(1)')).toBeUndefined()
    expect(safeFieldUrl('data:text/html,<b>x</b>')).toBeUndefined()
  })
})
