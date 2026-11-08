import { describe, expect, it } from 'vitest'
import { columnTypeReader, inferColumnType, widerFieldTypes } from './column-type'

describe('inferColumnType', () => {
  it('keeps what could be read two ways as text', () => {
    for (const cell of ['007', '+31', '1,5', '1.234,5', '1,234', '03/04/2026', '2026-02-30', 'yes']) expect(inferColumnType([cell]), cell).toEqual({ type: 'text' })
  })

  it('makes a column of mixed forms text', () => {
    expect(inferColumnType(['12', 'twelve'])).toEqual({ type: 'text' })
    expect(inferColumnType(['2026-03-01', '2026-03-01T10:00:00Z'])).toEqual({ type: 'text' })
    expect(inferColumnType([true, 'maybe'])).toEqual({ type: 'text' })
  })

  it('makes an empty column text, whose cells stay empty', () => {
    expect(inferColumnType([null, '', '  '])).toEqual({ type: 'text' })
    expect(inferColumnType([])).toEqual({ type: 'text' })
  })

  it('reads whole numbers as integer, past its range as a decimal of scale 0', () => {
    expect(inferColumnType(['12', '-3', null, 0])).toEqual({ type: 'integer' })
    expect(inferColumnType(['2147483647', '-2147483648'])).toEqual({ type: 'integer' })
    expect(inferColumnType(['2147483648'])).toEqual({ type: 'decimal', precision: 15, scale: 0 })
    expect(inferColumnType(['12345678901234567890'])).toEqual({ type: 'decimal', precision: 20, scale: 0 })
  })

  it('reads decimals with a point as a decimal with their most digits after it', () => {
    expect(inferColumnType(['1.5', '12', 2.25])).toEqual({ type: 'decimal', precision: 17, scale: 2 })
    expect(inferColumnType([1e-7])).toEqual({ type: 'decimal', precision: 22, scale: 7 })
  })

  it('reads true and false, ISO dates and ISO times', () => {
    expect(inferColumnType(['true', 'FALSE', false])).toEqual({ type: 'boolean' })
    expect(inferColumnType(['2026-03-01', { date: '2026-04-03' }])).toEqual({ type: 'date' })
    expect(inferColumnType(['2026-03-01T14:30:00+02:00', '2026-03-01 08:00Z'])).toEqual({ type: 'timestamp' })
    expect(inferColumnType([{ date: '2026-03-01T14:30:00' }, '2026-03-01T15:00'])).toEqual({ type: 'timestamp' })
    expect(inferColumnType(['2026-03-01T24:00:00Z'])).toEqual({ type: 'text' })
  })

  it('makes a column with a nested value JSON and one with a long value long text', () => {
    expect(inferColumnType([{ json: { a: 1 } }, 'b', 3])).toEqual({ type: 'json' })
    expect(inferColumnType(['short', 'x'.repeat(501)])).toEqual({ type: 'long_text' })
    expect(inferColumnType(['x'.repeat(500)])).toEqual({ type: 'text' })
  })

  it('reads a column a cell at a time, with the decimal it would become', () => {
    const reader = columnTypeReader()
    for (const cell of ['1', '22', '333']) reader.add(cell)
    expect(reader.type()).toEqual({ type: 'integer' })
    expect(reader.decimal()).toEqual({ type: 'decimal', precision: 15, scale: 0 })
  })
})

describe('widerFieldTypes', () => {
  it('offers only types that take every value as written', () => {
    expect(widerFieldTypes('integer')).toEqual(['integer', 'decimal', 'text', 'long_text'])
    expect(widerFieldTypes('boolean')).toEqual(['boolean', 'text', 'long_text'])
    expect(widerFieldTypes('text')).toEqual(['text', 'long_text'])
    expect(widerFieldTypes('long_text')).toEqual(['long_text'])
    expect(widerFieldTypes('json')).toEqual(['json'])
  })
})
