import { describe, expect, it } from 'vitest'
import { readQuoted } from './quoted-path'

describe('readQuoted', () => {
  it('decodes octal bytes as UTF-8 and C escapes', () => {
    expect(readQuoted('"a/caf\\303\\251 \\"menu\\".txt" b/x')).toEqual({ path: 'a/café "menu".txt', rest: ' b/x' })
    expect(readQuoted('"tab\\there\\\\back"')).toEqual({ path: 'tab\there\\back', rest: '' })
  })

  it('keeps characters that need no escape, beyond ASCII too', () => {
    expect(readQuoted('"a/my file 🙂.txt"')).toEqual({ path: 'a/my file 🙂.txt', rest: '' })
  })

  it('is undefined for a name that is not quoted, not closed, or holds an unknown escape', () => {
    expect(readQuoted('a/plain')).toBeUndefined()
    expect(readQuoted('"a/open')).toBeUndefined()
    expect(readQuoted('"a/\\q"')).toBeUndefined()
  })
})
