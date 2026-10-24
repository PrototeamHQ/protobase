import { describe, expect, it } from 'vitest'
import { jsonProblem, mergeJson } from './json-value'

describe('jsonProblem', () => {
  it('accepts plain JSON', () => {
    expect(jsonProblem({ a: [1, 'x', true, null, { b: 2.5 }] }, 'data')).toBeUndefined()
  })

  it.each([
    ['{"__proto__":{"polluted":1}}', 'data.__proto__'],
    ['{"a":{"constructor":{"prototype":{"polluted":1}}}}', 'data.a.constructor'],
    ['{"a":[{"b":{"prototype":1}}]}', 'data.a.0.b.prototype'],
  ])('refuses %s, naming %s', (text, path) => {
    expect(jsonProblem(JSON.parse(text), 'data')).toBe(path)
  })

  it.each([
    ['a function', { a: () => 1 }],
    ['an infinite number', { a: Infinity }],
    ['a date', { a: new Date() }],
    ['a getter', Object.defineProperty({}, 'a', { get: () => 1, enumerable: true })],
    ['a symbol key', { [Symbol('a')]: 1 }],
    ['undefined', { a: undefined }],
  ])('refuses %s', (_name, value) => {
    expect(jsonProblem(value, 'data')).toMatch(/^data/)
  })

  it('refuses a value nested deeper than 16 levels', () => {
    let deep: unknown = 1
    for (let i = 0; i < 20; i++) deep = { a: deep }
    expect(jsonProblem(deep, 'data')).toMatch(/^data(\.a)+$/)
  })
})

describe('mergeJson', () => {
  it('merges objects key by key and replaces anything else, changing neither', () => {
    const base = { a: { b: 1, c: 2 }, d: [1], e: 'x' }
    const merged = mergeJson(base, { a: { c: 3 }, d: [2], f: null })
    expect(merged).toEqual({ a: { b: 1, c: 3 }, d: [2], e: 'x', f: null })
    expect(base).toEqual({ a: { b: 1, c: 2 }, d: [1], e: 'x' })
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
  })
})
