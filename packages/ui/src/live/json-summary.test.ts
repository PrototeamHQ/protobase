import { describe, expect, it } from 'vitest'
import { jsonSummary, summaryLength } from './json-summary'

describe('jsonSummary', () => {
  it('shows an object as its keys and values, nested ones as marks', () => {
    expect(jsonSummary({ command: 'ls -la', cwd: '/tmp', env: { A: '1' }, args: [1, 2], none: null, quiet: true })).toBe('command: ls -la, cwd: /tmp, env: {…}, args: […], none: null, quiet: true')
  })

  it('shows a list of plain values as the values', () => {
    expect(jsonSummary(['a', 2, false])).toBe('a, 2, false')
  })

  it('shows a list of objects as its length', () => {
    expect(jsonSummary([{ a: 1 }, { b: 2 }])).toBe('2 items')
    expect(jsonSummary([[1]])).toBe('1 item')
  })

  it('shows empty objects and lists as such', () => {
    expect(jsonSummary({})).toBe('{}')
    expect(jsonSummary([])).toBe('[]')
    expect(jsonSummary({ a: {}, b: [] })).toBe('a: {}, b: []')
  })

  it('shows a plain JSON value as itself', () => {
    expect(jsonSummary('hello')).toBe('hello')
    expect(jsonSummary(42)).toBe('42')
  })

  it('cuts a long value to one line of its length', () => {
    const summary = jsonSummary(Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`key_${index}`, 'x'.repeat(20)])))
    expect(summary).toHaveLength(summaryLength)
    expect(summary.endsWith('…')).toBe(true)
  })
})
