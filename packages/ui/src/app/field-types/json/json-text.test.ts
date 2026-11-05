import { describe, expect, it } from 'vitest'
import { jsonOf, notJson } from './json-text'

describe('a JSON field’s text', () => {
  it('holds the value it parses to, null when empty, and none when it does not parse', () => {
    expect(jsonOf('{"url": "https://a.example"}')).toEqual({ url: 'https://a.example' })
    expect(jsonOf('  ')).toBeNull()
    expect(jsonOf('{"url": ')).toBe(notJson)
  })
})
