import { describe, expect, it } from 'vitest'
import { misleadingLinkText } from './link-text'

describe('misleadingLinkText', () => {
  it('flags text naming another host than the link opens', () => {
    expect(misleadingLinkText('https://acme.example/billing', 'https://evil.example')).toBe(true)
    expect(misleadingLinkText('www.acme.example', 'https://evil.example/www.acme.example')).toBe(true)
    expect(misleadingLinkText('acme.example', 'mailto:a@acme.example')).toBe(true)
  })

  it('keeps text on the host the link opens, and text that names no address', () => {
    expect(misleadingLinkText('https://acme.example/billing', 'https://ACME.example/other')).toBe(false)
    expect(misleadingLinkText('www.acme.example', 'http://www.acme.example')).toBe(false)
    expect(misleadingLinkText('the docs', 'https://docs.example')).toBe(false)
    expect(misleadingLinkText('v1.2', 'https://docs.example')).toBe(false)
  })
})
