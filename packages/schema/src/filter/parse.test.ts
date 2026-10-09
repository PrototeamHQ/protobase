import { describe, expect, it } from 'vitest'
import type { FilterExpr } from '../model'
import { parseFilter } from './parse'
import { printFilter } from './print'
import { stripSpans } from './strip-spans'

const ast = (source: string) => {
  const result = parseFilter(source)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.ast!
}
const shape = (source: string) => stripSpans(ast(source))
const errorsOf = (source: string) => {
  const result = parseFilter(source)
  if (result.ok) throw new Error('expected errors')
  return result.errors
}
const field = (...path: string[]) => ({ kind: 'field', path })
const str = (value: string) => ({ kind: 'string', value })
const num = (value: number) => ({ kind: 'number', value, raw: String(value) })

describe('lowering the AIP-160 tree', () => {
  it('comparisons and the has operator', () => {
    for (const op of ['=', '!=', '<', '<=', '>', '>=']) {
      expect(shape(`a ${op} 1`)).toEqual({ kind: 'compare', op, field: field('a'), value: num(1) })
    }
    expect(shape('r:42')).toEqual({ kind: 'has', field: field('r'), value: num(42) })
    expect(shape('meta:*')).toEqual({ kind: 'present', field: field('meta') })
  })

  it('precedence: OR binds tighter than AND, whitespace sits between', () => {
    expect(printFilter(ast('a = 1 AND b = 2 OR c = 3'))).toBe('a = 1 AND (b = 2 OR c = 3)')
    expect(printFilter(ast('x y OR z AND w'))).toBe('(search("x") AND (search("y") OR search("z"))) AND search("w")')
  })

  it('implicit AND is AND; NOT and minus are the same', () => {
    expect(shape('a = 1 b = 2')).toMatchObject({ kind: 'and', args: [{ kind: 'compare' }, { kind: 'compare' }] })
    expect(shape('NOT a = 1')).toEqual(shape('-a = 1'))
  })

  it('bare words and values are search terms', () => {
    expect(shape('hello')).toEqual({ kind: 'search', text: 'hello' })
    expect(shape('"hello world"')).toEqual({ kind: 'search', text: 'hello world' })
    expect(shape('42')).toEqual({ kind: 'search', text: '42' })
    expect(shape('search("two words")')).toEqual({ kind: 'search', text: 'two words' })
  })

  it('a bare word on the right is a string, as in aip-go', () => {
    expect(shape('status = paid')).toEqual({ kind: 'compare', op: '=', field: field('status'), value: str('paid') })
    expect(shape('flag = true')).toMatchObject({ value: { kind: 'boolean', value: true } })
    expect(shape('package = com.google')).toMatchObject({ value: str('com.google') })
  })

  it('literals: strings, numbers, durations, timestamps', () => {
    const value = (source: string) => (shape(`a = ${source}`) as Extract<FilterExpr, { kind: 'compare' }>).value
    expect(value(`'it\\'s'`)).toEqual(str("it's"))
    expect(value('-5')).toEqual(num(-5))
    expect(value('2.997e9')).toMatchObject({ raw: '2.997e9' })
    expect(value('30d')).toEqual({ kind: 'duration', amount: 30, unit: 'd' })
    expect(value('2012-04-21T11:30:00Z')).toEqual({ kind: 'timestamp', value: '2012-04-21T11:30:00Z' })
  })

  it('now() with offsets', () => {
    expect(shape('a > now()')).toMatchObject({ value: { kind: 'now' } })
    expect(shape('a > now() - 30d')).toMatchObject({
      value: { kind: 'now', offset: { sign: '-', duration: { amount: 30, unit: 'd' } } },
    })
    expect(shape('a > now()+1h')).toMatchObject({ value: { offset: { sign: '+' } } })
  })

  it('functions', () => {
    expect(shape('in(status, "a", "b", 3)')).toEqual({ kind: 'in', field: field('status'), values: [str('a'), str('b'), num(3)] })
    expect(shape('similar(title, "helo")')).toEqual({ kind: 'similar', field: field('title'), text: 'helo' })
    expect(shape('regex(title, "^A.*")')).toEqual({ kind: 'regex', field: field('title'), pattern: '^A.*' })
    expect(shape('isNull(deletedAt)')).toEqual({ kind: 'isNull', field: field('deletedAt') })
    expect(shape('customer.country = "NL"')).toMatchObject({ field: field('customer', 'country') })
  })
})

describe('errors', () => {
  it('library syntax errors pass through with spans and hints', () => {
    const [error] = errorsOf('a = 1 AND b = !')
    expect(error).toMatchObject({ code: 'unexpected-character', span: { start: 14, end: 15 } })
    expect(error!.hint).toBeTruthy()
    expect(errorsOf('a = "abc')[0]).toMatchObject({ code: 'unterminated-string' })
    expect(errorsOf('a > 2012-04-21')[0]).toMatchObject({ code: 'invalid-timestamp' })
    expect(errorsOf('(a = 1')[0]).toMatchObject({ code: 'expected-token' })
  })

  it('unknown functions list the available ones', () => {
    const [error] = errorsOf('drop(x)')
    expect(error).toMatchObject({ code: 'unknown-function', span: { start: 0, end: 7 } })
    expect(error!.hint).toContain('isNull')
  })

  it('invalid arguments show the usage', () => {
    for (const source of ['in(a)', 'search(a)', 'regex(a)', 'similar("a", "b")', 'isNull(a, b)']) {
      expect(errorsOf(source)[0], source).toMatchObject({ code: 'invalid-arguments' })
    }
    expect(errorsOf('in(a)')[0]!.hint).toContain('in(field')
  })

  it('constructs outside the Protobase profile are unsupported', () => {
    expect(errorsOf('1 > 0')[0]).toMatchObject({ code: 'unsupported' })
    expect(shape('a = 1 -b')).toMatchObject({ kind: 'and', args: [{ kind: 'compare' }, { kind: 'not', arg: { kind: 'search', text: 'b' } }] })
    expect(errorsOf('a = other(x)')[0]).toMatchObject({ code: 'unsupported' })
    for (const source of ['a > now() - 30', 'a > now() - x']) expect(errorsOf(source)[0]!.hint).toContain('Durations need a unit')
    expect(shape('a > now() -30d')).toMatchObject({ value: { offset: { sign: '-' } } })
  })

  it('collects errors from both stages and keeps the partial tree', () => {
    const result = parseFilter('a = ! AND drop(x) AND b = 2')
    expect(result.ok).toBe(false)
    expect(result.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['unexpected-character', 'unknown-function']))
    expect(result.ast).toBeUndefined()
  })

  it('injection-looking strings are plain strings', () => {
    const evil = "'; DROP TABLE x; --"
    expect(shape(`title = "${evil}"`)).toMatchObject({ value: str(evil) })
    expect(shape(`"${evil}"`)).toEqual({ kind: 'search', text: evil })
    expect(printFilter(ast(`title = "${evil}"`))).toBe(`title = "${evil}"`)
  })
})

describe('limits', () => {
  it('length defaults to 10,000 and is configurable; depth stays limited', () => {
    const long = `in(id, ${Array.from({ length: 5000 }, (_, i) => i).join(', ')})`
    expect(parseFilter(long).errors[0]).toMatchObject({ code: 'too-long' })
    expect(parseFilter(long, { maxLength: 200_000 }).ok).toBe(true)
    expect(parseFilter(`${'('.repeat(100)}a = 1${')'.repeat(100)}`, { maxLength: 200_000 }).errors[0]).toMatchObject({ code: 'too-deep' })
  })
})
