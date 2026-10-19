import { afterEach, describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { parseNumberText } from '../../format/number-text'
import { setFallbackLocale } from '../../locale/active-locale'
import { convertCell, type ConvertOptions } from './convert'

const field = (type: string, extra: Partial<FieldModel> = {}) => ({ name: 'x', column: 'x', type, nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra }) as FieldModel
const european: ConvertOptions = { decimal: ',', dateOrder: 'dmy' }
const american: ConvertOptions = { decimal: '.', dateOrder: 'mdy' }
const convert = (type: string, cell: Parameters<typeof convertCell>[2], options = american, extra: Partial<FieldModel> = {}) => convertCell(field(type, extra), { valueLabels: { in_progress: 'In progress', done: 'Done' } }, cell, options)

describe('parseNumberText', () => {
  it('reads grouped numbers with either decimal separator', () => {
    expect(parseNumberText('1,234.50', '.')).toBe('1234.50')
    expect(parseNumberText('1.234,50', ',')).toBe('1234.50')
    expect(parseNumberText('-1 234 567,5', ',')).toBe('-1234567.5')
    expect(parseNumberText("1'000", '.')).toBe('1000')
    expect(parseNumberText('1.5e3', '.')).toBe('1500')
  })

  it('refuses what is not a number in the file\'s format', () => {
    expect(parseNumberText('1,23', '.')).toBeUndefined()
    expect(parseNumberText('1.5', ',')).toBeUndefined()
    expect(parseNumberText('12abc', '.')).toBeUndefined()
    expect(parseNumberText('', '.')).toBeUndefined()
  })
})

describe('convertCell', () => {
  it('makes an empty cell null, and an error on a required field rather than a default', () => {
    expect(convert('text', '  ')).toEqual({ ok: true, value: null })
    expect(convert('integer', null, american, { nullable: false, default: { value: 1 } })).toEqual({ ok: false, problem: 'is empty, and it is required' })
  })

  it('converts numbers by field type, refusing fractions for whole numbers', () => {
    expect(convert('integer', '1,200')).toEqual({ ok: true, value: 1200 })
    expect(convert('integer', 7)).toEqual({ ok: true, value: 7 })
    expect(convert('integer', '12.00')).toEqual({ ok: true, value: 12 })
    expect(convert('integer', '1.5')).toEqual({ ok: false, problem: '“1.5” is not a whole number' })
    expect(convert('bigint', '9007199254740993')).toEqual({ ok: true, value: '9007199254740993' })
    expect(convert('decimal', '1.234,56', european)).toEqual({ ok: true, value: '1234.56' })
    expect(convert('decimal', 0.25)).toEqual({ ok: true, value: '0.25' })
    expect(convert('decimal', 'n/a')).toEqual({ ok: false, problem: '“n/a” is not a number' })
  })

  it('reads booleans in their common forms', () => {
    expect(convert('boolean', 'Yes')).toEqual({ ok: true, value: true })
    expect(convert('boolean', '0')).toEqual({ ok: true, value: false })
    expect(convert('boolean', false)).toEqual({ ok: true, value: false })
    expect(convert('boolean', 'maybe').ok).toBe(false)
  })

  it('reads dates as ISO, or with day and month in the file\'s order', () => {
    expect(convert('date', '2026-04-03')).toEqual({ ok: true, value: '2026-04-03' })
    expect(convert('date', '03/04/2026', european)).toEqual({ ok: true, value: '2026-04-03' })
    expect(convert('date', '03/04/2026', american)).toEqual({ ok: true, value: '2026-03-04' })
    expect(convert('date', { date: '2026-04-03' })).toEqual({ ok: true, value: '2026-04-03' })
    expect(convert('date', '31/02/2026', european).ok).toBe(false)
    expect(convert('date', '03/04/26', european).ok).toBe(false)
    expect(convert('date', { date: '2026-04-03T10:00:00' })).toEqual({ ok: false, problem: '“2026-04-03 10:00:00” has a time of day; the field holds a date' })
    expect(convert('date', 46082)).toEqual({ ok: false, problem: '“46082” is not a date (2026-04-03 or month/day/year)' })
  })

  it('reads a timestamp with its zone, or without one as local time', () => {
    expect(convert('timestamp', '2026-04-03T10:00:00+02:00')).toEqual({ ok: true, value: '2026-04-03T08:00:00.000Z' })
    expect(convert('timestamp', '2026-04-03 10:00Z')).toEqual({ ok: true, value: '2026-04-03T10:00:00.000Z' })
    expect(convert('timestamp', '03-04-2026 10:30', european)).toEqual({ ok: true, value: new Date(2026, 3, 3, 10, 30).toISOString() })
    expect(convert('timestamp', { date: '2026-04-03T10:30:00' })).toEqual({ ok: true, value: new Date(2026, 3, 3, 10, 30).toISOString() })
  })

  it('matches enum values by their labels and values, ignoring case and spacing', () => {
    const status = { enumValues: ['in_progress', 'done'] }
    expect(convert('enum', ' in  PROGRESS', american, status)).toEqual({ ok: true, value: 'in_progress' })
    expect(convert('enum', 'done', american, status)).toEqual({ ok: true, value: 'done' })
    expect(convert('enum', 'Finished', american, status)).toEqual({ ok: false, problem: '“Finished” is not one of In progress, Done' })
  })

  it('keeps text as written, numbers as their digits, and refuses true or false as text', () => {
    expect(convert('text', ' Acme ')).toEqual({ ok: true, value: ' Acme ' })
    expect(convert('text', 612345678)).toEqual({ ok: true, value: '612345678' })
    expect(convert('text', true).ok).toBe(false)
  })
})

describe('convertCell in Dutch', () => {
  afterEach(() => setFallbackLocale('en'))

  it('words a problem in the language the screens are in', () => {
    setFallbackLocale('nl')
    expect(convert('decimal', 'n/a')).toEqual({ ok: false, problem: '“n/a” is geen getal' })
  })
})
