import { describe, expect, it } from 'vitest'
import { tapUrl } from './tap-url'

describe('tapUrl', () => {
  it.each([
    ' JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    '\u0000javascript:alert(1)',
    'javascript:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    'file:///etc/passwd',
    'blob:https://app.example/x',
    'intent://x#Intent;end',
    '//evil.example/x',
    '/records/1',
    'records/1',
    'https://app.example/a b',
    'https://app.example/\u0085',
    '',
  ])('refuses %j', (url) => {
    expect(tapUrl(url)).toBeUndefined()
  })

  it('refuses what is not a string', () => {
    expect(tapUrl(['https://app.example/'])).toBeUndefined()
    expect(tapUrl({ href: 'https://app.example/' })).toBeUndefined()
  })

  it('accepts an http or https URL on any origin, as the WHATWG parser writes it', () => {
    expect(tapUrl('https://other.example/x?y=1')).toBe('https://other.example/x?y=1')
    expect(tapUrl('HTTP://App.Example')).toBe('http://app.example/')
    expect(tapUrl('https://evil.example\\@app.example/')).toBe('https://evil.example/@app.example/')
  })
})
