import { describe, expect, it } from 'vitest'
import { conversationRows, firstUnreadKey } from './conversation-rows'

const fields = { key: (row: Record<string, unknown>) => String(row.id), sender: 'author_id', time: 'sent_at' }
const message = (id: number, author: string, sentAt: string) => ({ id, author_id: author, sent_at: sentAt })
// 27 Oct 2026, noon UTC
const now = Date.parse('2026-10-27T12:00:00Z')

const shape = (rows: ReturnType<typeof conversationRows>) => rows.map((row) => (row.kind === 'message' ? `${row.key}${row.continued ? '+' : ''}` : row.kind === 'day' ? `[${row.label}]` : '[new]'))

describe('conversationRows', () => {
  it("groups one author's quick run of messages, and starts anew after five minutes or another author", () => {
    const rows = [
      message(1, 'maya', '2026-10-27T09:00:00Z'),
      message(2, 'maya', '2026-10-27T09:04:59Z'),
      message(3, 'maya', '2026-10-27T09:10:00Z'),
      message(4, 'sam', '2026-10-27T09:10:30Z'),
      message(5, 'maya', '2026-10-27T09:11:00Z'),
    ]
    expect(shape(conversationRows(rows, fields, undefined, now))).toEqual(['[Today]', '1', '2+', '3', '4', '5'])
  })

  it('puts a day divider where a day begins, which also ends a run', () => {
    const rows = [message(1, 'maya', '2026-10-26T23:58:00Z'), message(2, 'maya', '2026-10-27T00:01:00Z')]
    const zoned = conversationRows(rows, fields, undefined, now).filter((row) => row.kind === 'day')
    // Whether 23:58 UTC is another day depends on the viewer's zone; a day divider never leaves a message continued
    const lines = conversationRows(rows, fields, undefined, now)
    if (zoned.length === 2) expect(shape(lines)).toEqual(['[Yesterday]', '1', '[Today]', '2'])
    else expect(lines.at(-1)).toMatchObject({ kind: 'message', continued: true })
  })

  it('puts the "New messages" line above its message, which then starts a run of its own', () => {
    const rows = [message(1, 'maya', '2026-10-27T09:00:00Z'), message(2, 'maya', '2026-10-27T09:01:00Z')]
    expect(shape(conversationRows(rows, fields, '2', now))).toEqual(['[Today]', '1', '[new]', '2'])
  })

  it('names the author of a relation as the list labels it', () => {
    const [, first] = conversationRows([{ id: 1, author_id: { id: 'u-1', name: 'Maya' }, sent_at: '2026-10-27T09:00:00Z' }], fields, undefined, now)
    expect(first).toMatchObject({ kind: 'message', author: { id: 'u-1', name: 'Maya' } })
  })
})

describe('firstUnreadKey', () => {
  const rows = [message(10, 'sam', 'a'), message(11, 'me', 'b'), message(12, 'sam', 'c'), message(13, 'sam', 'd')]

  it("is the first message after the read position that someone else wrote", () => {
    expect(firstUnreadKey(rows, fields, 10, 'me', false)).toBe('12')
    expect(firstUnreadKey(rows, fields, 0, 'me', false)).toBe('10')
  })

  it('is none when everything is read, or only the reader wrote since', () => {
    expect(firstUnreadKey(rows, fields, 13, 'me', false)).toBeUndefined()
    expect(firstUnreadKey(rows.slice(0, 2), fields, 10, 'me', false)).toBeUndefined()
  })

  it('is none when the first loaded message is unread and earlier ones are not loaded, rather than a line in the wrong place', () => {
    expect(firstUnreadKey(rows, fields, 0, 'me', true)).toBeUndefined()
    expect(firstUnreadKey(rows, fields, 10, 'me', true)).toBe('12')
  })
})
