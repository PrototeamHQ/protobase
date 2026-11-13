import { describe, expect, it } from 'vitest'
import { blocks, code, escapeMarkdown, fenced, json, labelled, valueText } from './markdown'

describe('markdown primitives', () => {
  it('escapes markup characters and line-leading markers', () => {
    expect(escapeMarkdown('a_b [c] `d`')).toBe('a\\_b \\[c\\] \\`d\\`')
    expect(escapeMarkdown('- item\n1. first')).toBe('\\- item\n1\\. first')
  })

  it('reads values: a dash for none, labels for enum values, lists as items, objects as JSON', () => {
    expect(valueText(null)).toBe('—')
    expect(valueText('paid', { paid: 'Paid in full' })).toBe('Paid in full')
    expect(valueText(['a', 'b'], { a: 'A' })).toBe('A, b')
    expect(valueText({ a: 1 })).toBe('```json\n{\n  "a": 1\n}\n```')
    expect(valueText(false)).toBe('false')
  })

  it('puts a value of several lines under its label', () => {
    expect(labelled('Data', '```json\n{}\n```')).toBe('**Data**\n\n```json\n{}\n```')
    expect(labelled('', 'value')).toBe('value')
  })

  it('makes code fences and spans longer than any run of backticks in their text', () => {
    expect(code('run')).toBe('`run`')
    expect(code('run`it')).toBe('`` run`it ``')
    expect(fenced('bad ``` fence')).toBe('````\nbad ``` fence\n````')
    expect(json({ note: '```' })).toBe('````json\n{\n  "note": "```"\n}\n````')
  })

  it('leaves empty parts out', () => {
    expect(blocks(['a', '', 'b'])).toBe('a\n\nb')
  })
})
