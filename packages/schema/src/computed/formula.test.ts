import { describe, expect, it } from 'vitest'
import { formulaFields, formulaNullable, parseFormula } from './formula'

describe('parseFormula', () => {
  it('reads operators by precedence, left to right', () => {
    expect(parseFormula('a + b * 2 - c')).toEqual({
      kind: 'binary',
      op: '-',
      left: { kind: 'binary', op: '+', left: { kind: 'field', name: 'a' }, right: { kind: 'binary', op: '*', left: { kind: 'field', name: 'b' }, right: { kind: 'number', value: '2' } } },
      right: { kind: 'field', name: 'c' },
    })
  })

  it('reads parentheses, a leading minus and the functions', () => {
    expect(parseFormula('-(a) / round(coalesce(b, 0.5), 2)')).toEqual({
      kind: 'binary',
      op: '/',
      left: { kind: 'negate', operand: { kind: 'field', name: 'a' } },
      right: { kind: 'round', value: { kind: 'coalesce', args: [{ kind: 'field', name: 'b' }, { kind: 'number', value: '0.5' }] }, digits: 2 },
    })
    expect(parseFormula('round(a)')).toEqual({ kind: 'round', value: { kind: 'field', name: 'a' } })
  })

  it('names what it cannot read and where', () => {
    expect(() => parseFormula('a + ')).toThrow('Formula "a + ": expected a number, a field or "(" at the end')
    expect(() => parseFormula('a b')).toThrow('expected an operator at 3, found "b"')
    expect(() => parseFormula('a % b')).toThrow('unexpected "%" at 3')
    expect(() => parseFormula('sqrt(a)')).toThrow('unknown function "sqrt", only coalesce() and round() at 1')
    expect(() => parseFormula('coalesce(a)')).toThrow('coalesce() takes at least two values')
    expect(() => parseFormula('round(a, b)')).toThrow("round()'s digits must be a whole number")
    expect(() => parseFormula('(a + b')).toThrow('expected ")" at the end')
  })
})

describe('formulaFields', () => {
  it('lists each field once', () => {
    expect(formulaFields(parseFormula('a * b + coalesce(a, c)'))).toEqual(['a', 'b', 'c'])
  })
})

describe('formulaNullable', () => {
  const nullable = (field: string) => field.startsWith('maybe')
  it('is empty when a field it needs is, unless coalesce() has a value', () => {
    expect(formulaNullable(parseFormula('a * 2'), nullable)).toBe(false)
    expect(formulaNullable(parseFormula('a * maybe_b'), nullable)).toBe(true)
    expect(formulaNullable(parseFormula('a * coalesce(maybe_b, 1)'), nullable)).toBe(false)
    expect(formulaNullable(parseFormula('coalesce(maybe_a, maybe_b)'), nullable)).toBe(true)
  })
})
