import { describe, expect, it } from 'vitest'
import { bounds, boundItem, type MailItem } from './item-bounds'

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

const item = (parts: Partial<MailItem> = {}): MailItem => ({
  message_id: 'abc',
  thread_id: 'abc',
  from: { name: 'Ada', address: 'ada@example.com' },
  to: [],
  cc: [],
  subject: 'Hello',
  date: null,
  text: 'Hi',
  html: null,
  attachments: [],
  truncated: false,
  ...parts,
})

// Characters JSON escapes as six bytes each, the most any character can grow.
const escaped = (length: number) => '\u0001'.repeat(length)

describe('boundItem', () => {
  it('keeps a mail within its bounds as it is', () => {
    const small = item({ to: [{ name: null, address: 'grace@example.com' }] })
    expect(boundItem(small)).toEqual(small)
  })

  it('cuts a long body to its bound and says so', () => {
    const bounded = boundItem(item({ text: 'x'.repeat(3 * 1024 * 1024) }))
    expect(bounded.text).toHaveLength(bounds.bodyLength)
    expect(bounded.truncated).toBe(true)
  })

  it('keeps the worst mail under the item limit, leaving out html and then text', () => {
    const address = { name: escaped(5000), address: escaped(5000) }
    const worst = item({
      from: address,
      to: Array.from({ length: 500 }, () => address),
      cc: Array.from({ length: 500 }, () => address),
      subject: escaped(100_000),
      date: escaped(10_000),
      text: escaped(3 * 1024 * 1024),
      html: escaped(3 * 1024 * 1024),
      attachments: Array.from({ length: 500 }, () => ({ filename: escaped(10_000), content_type: escaped(10_000), size: 1 })),
    })
    const bounded = boundItem(worst)
    expect(jsonBytes(bounded)).toBeLessThanOrEqual(bounds.itemBytes)
    expect(bounded).toMatchObject({ html: null, text: null, truncated: true })
    expect(bounded.to).toHaveLength(bounds.addresses)
    expect(bounded.attachments).toHaveLength(bounds.attachments)
    expect(bounded.to[0]!.name).toHaveLength(bounds.nameLength)
    expect(bounded.subject).toHaveLength(bounds.subjectLength)
  })

  it('leaves out NUL and lone surrogates, keeping whole pairs, and says so', () => {
    const bounded = boundItem(item({ subject: 'a\u0000b\uD800c\uDC00d\uD83D\uDE00', from: { name: '\u0000', address: null } }))
    expect(bounded).toMatchObject({ subject: 'abcd\uD83D\uDE00', from: { name: '', address: null }, truncated: true })
  })

  it('never cuts between the halves of a surrogate pair', () => {
    const bounded = boundItem(item({ subject: 'x'.repeat(bounds.subjectLength - 1) + '\uD83D\uDE00' }))
    expect(bounded.subject).toBe('x'.repeat(bounds.subjectLength - 1))
    expect(bounded.truncated).toBe(true)
  })

  it('keeps text when leaving out html is enough', () => {
    const bounded = boundItem(item({ text: 'x'.repeat(bounds.bodyLength), html: escaped(bounds.bodyLength) }))
    expect(bounded.html).toBeNull()
    expect(bounded.text).toHaveLength(bounds.bodyLength)
  })
})
