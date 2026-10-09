import { describe, expect, it } from 'vitest'
import type { FilterExpr, Literal } from '../model'
import { parseFilter } from './parse'
import { printFilter } from './print'
import { stripSpans } from './strip-spans'

const parse = (source: string) => {
  const result = parseFilter(source)
  if (!result.ok || !result.ast) throw new Error(`parse failed: ${source}: ${JSON.stringify(result.errors)}`)
  return result.ast
}

const corpus = [
  'a = 1',
  'a = 1 b = 2 OR c = 3',
  'a = 1 AND b = 2 OR c = 3 AND d = 4',
  '-a = 1 NOT b:* NOT (c = 1 OR d = 2)',
  'NOT (NOT a = 1)',
  'x y z',
  'title = "*.foo" AND createdAt > now() - 30d',
  "title = 'it\\'s' OR title = \"say \\\"hi\\\"\"",
  'in(status, paid, "sent") AND (similar(title, "x") OR regex(title, "^a"))',
  '((a = 1))',
  'a = 1e3 AND b >= -2.50 AND c < 1.50h',
  'meta:42 AND meta:"x" AND meta:*',
  '(a = 1 AND b = 2) AND c = 3',
  'a = 2012-04-21T11:30:00+02:00',
  'a = 1.0 AND d = 1.50h',
]

describe('printer', () => {
  it('quotes strings with escapes', () => {
    expect(printFilter(parse(`title = "a\\"b\\\\c\\nd"`))).toBe('title = "a\\"b\\\\c\\nd"')
    expect(printFilter(parse("title = 'it\\'s'"))).toBe('title = "it\'s"')
  })

  it('always parenthesizes nested groups', () => {
    expect(printFilter(parse('a = 1 OR b = 2 c = 3'))).toBe('(a = 1 OR b = 2) AND c = 3')
    expect(printFilter(parse('a = 1 OR (b = 2 AND c = 3)'))).toBe('a = 1 OR (b = 2 AND c = 3)')
    expect(printFilter(parse('NOT (a = 1 OR b = 2)'))).toBe('NOT (a = 1 OR b = 2)')
  })

  it.each(corpus)('print(parse(s)) is stable: %s', (source) => {
    const once = printFilter(parse(source))
    const twice = printFilter(parse(once))
    expect(twice).toBe(once)
    expect(stripSpans(parse(once))).toEqual(stripSpans(parse(source)))
  })
})

// Seeded generator so failures are reproducible.
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const span = { start: 0, end: 0 }
const names = ['a', 'status', 'customer_id', 'x1', 'createdAt', 'meta']
const texts = ['', 'plain', 'with "quotes"', "it's", 'back\\slash', 'line\nbreak', 'tab\t', '*.foo', "'; DROP TABLE x; --", 'ünï ✓', '\u0001', '(a OR b)']

const generate = (random: () => number) => {
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)]!
  const field = () => ({ kind: 'field' as const, path: random() < 0.2 ? [pick(names), pick(names)] : [pick(names)], span })
  const literal = (): Literal => {
    switch (Math.floor(random() * 6)) {
      case 0:
        return { kind: 'string', value: pick(texts), span }
      case 1: {
        const value = pick([0, 1, 42, -7, 1.5, -0.25, 1e21, 2.997e9])
        return { kind: 'number', value, raw: String(value), span }
      }
      case 2:
        return { kind: 'boolean', value: random() < 0.5, span }
      case 3:
        return { kind: 'duration', amount: pick([1, 30, 1.5, 0.25]), unit: pick(['s', 'm', 'h', 'd', 'w'] as const), span }
      case 4:
        return { kind: 'timestamp', value: pick(['2012-04-21T11:30:00-04:00', '2012-04-21T11:30:00Z']), span }
      default:
        return { kind: 'string', value: pick(texts), span }
    }
  }
  const value = () =>
    random() < 0.2
      ? ({ kind: 'now', span, ...(random() < 0.6 && { offset: { sign: pick(['+', '-'] as const), duration: { kind: 'duration' as const, amount: pick([30, 1.5]), unit: 'd' as const, span } } }) } as const)
      : literal()
  const node = (depth: number): FilterExpr => {
    const roll = depth <= 0 ? 4 + Math.floor(random() * 7) : Math.floor(random() * 11)
    switch (roll) {
      case 0:
      case 1:
        return { kind: random() < 0.5 ? 'and' : 'or', args: [node(depth - 1), node(depth - 1), ...(random() < 0.3 ? [node(depth - 1)] : [])], span }
      case 2:
      case 3:
        return { kind: 'not', arg: node(depth - 1), span }
      case 4:
        return { kind: 'compare', op: pick(['=', '!=', '<', '<=', '>', '>='] as const), field: field(), value: value(), span }
      case 5:
        return { kind: 'has', field: field(), value: literal(), span }
      case 6:
        return { kind: 'present', field: field(), span }
      case 7:
        return { kind: 'in', field: field(), values: [literal(), ...(random() < 0.5 ? [literal()] : [])], span }
      case 8:
        return { kind: 'search', text: pick(texts), span }
      case 9:
        return random() < 0.5
          ? { kind: 'similar', field: field(), text: pick(texts), span }
          : { kind: 'regex', field: field(), pattern: pick(texts), span }
      default:
        return { kind: 'isNull', field: field(), span }
    }
  }
  return node(4)
}

describe('printer property', () => {
  it('parse(print(ast)) equals ast for random ASTs', () => {
    const random = rng(1234)
    for (let i = 0; i < 1000; i++) {
      const ast = generate(random)
      const printed = printFilter(ast)
      const reparsed = parseFilter(printed)
      expect(reparsed.ok, printed).toBe(true)
      expect(stripSpans(reparsed.ast), printed).toEqual(stripSpans(ast))
      expect(printFilter(reparsed.ast!)).toBe(printed)
    }
  })
})
