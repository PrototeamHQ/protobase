import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContactLink } from './contact-link'
import { contactFormat, contactHref, contactInputProps } from './contact-links'

describe('contactHref', () => {
  it('writes to an email address, calls a phone number by its digits and opens a web address', () => {
    expect(contactHref('email', ' emma@example.nl ')).toBe('mailto:emma@example.nl')
    expect(contactHref('phone', '+31 (6) 3456-7890')).toBe('tel:+31634567890')
    expect(contactHref('url', 'https://example.nl/about')).toBe('https://example.nl/about')
  })

  it('links nothing that is no such address, so it shows as text', () => {
    expect(contactHref('email', 'emma at example')).toBeUndefined()
    expect(contactHref('phone', 'ask at the desk')).toBeUndefined()
    expect(contactHref('url', 'example.nl')).toBeUndefined()
    expect(contactHref('url', 'javascript:alert(1)')).toBeUndefined()
  })
})

describe('contactInputProps', () => {
  it('asks for the keyboard and autofill of the address', () => {
    expect(contactInputProps('email')).toEqual({ type: 'email', inputMode: 'email', autoComplete: 'email' })
    expect(contactInputProps('phone')).toEqual({ type: 'tel', inputMode: 'tel', autoComplete: 'tel' })
    expect(contactInputProps('url')).toEqual({ type: 'url', inputMode: 'url', autoComplete: 'url' })
    expect(contactInputProps(undefined)).toEqual({})
  })
})

describe('contactFormat', () => {
  it('reads only the address formats', () => {
    expect(contactFormat({ format: 'phone' })).toBe('phone')
    expect(contactFormat({ format: 'code' })).toBeUndefined()
    expect(contactFormat(undefined)).toBeUndefined()
  })
})

describe('ContactLink', () => {
  const html = (format: 'email' | 'phone' | 'url', value: string) => renderToStaticMarkup(createElement(ContactLink, { format, value }))

  it('is a real link, a web page opening in a new tab', () => {
    expect(html('email', 'emma@example.nl')).toMatch(/^<a href="mailto:emma@example.nl" class="[^"]*">emma@example.nl<\/a>$/)
    expect(html('url', 'https://example.nl')).toMatch(/^<a href="https:\/\/example.nl" target="_blank" rel="noreferrer" class="/)
  })

  it('is text when the value is no address', () => {
    expect(html('url', 'example.nl')).toBe('<span>example.nl</span>')
  })
})
