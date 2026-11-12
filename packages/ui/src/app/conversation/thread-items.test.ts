import { describe, expect, it } from 'vitest'
import { threadItems } from './thread-items'

const fields = { key: (row: Record<string, unknown>) => String(row.id), sender: 'author', time: 'sent_at', text: 'body' }
const now = Date.parse('2026-11-10T12:00:00Z')

describe('threadItems', () => {
  it('shows the newest-first messages oldest first, a divider above each day and a sender’s next message that day continued', () => {
    const rows = [
      { id: 4, author: { id: '1', name: 'Ann' }, sent_at: '2026-11-10T09:01:00Z', body: 'Morning' },
      { id: 3, author: { id: '2', name: 'Bo' }, sent_at: '2026-11-10T09:00:00Z', body: 'Hi' },
      { id: 2, author: { id: '1', name: 'Ann' }, sent_at: '2026-11-08T10:05:00Z', body: null },
      { id: 1, author: { id: '1', name: 'Ann' }, sent_at: '2026-11-08T10:00:00Z', body: 'First' },
    ]
    expect(threadItems(rows, fields, now).map((item) => (item.kind === 'day' ? `— ${item.label}` : `${item.author.name}${item.continued ? ' (cont.)' : ''}: ${item.text}`))).toEqual([
      '— Sunday, 8 Nov 2026',
      'Ann: First',
      'Ann (cont.): ',
      '— Today',
      'Bo: Hi',
      'Ann: Morning',
    ])
  })

  it('names a sender that is no relation by its own value', () => {
    const [, message] = threadItems([{ id: 1, author: 'Ann', sent_at: '2026-11-10T09:00:00Z', body: 'Hi' }], fields, now)
    expect(message).toMatchObject({ kind: 'message', author: { id: 'Ann', name: 'Ann' }, time: '2026-11-10T09:00:00Z' })
  })

  it('gives a message with a status that status, and one without none', () => {
    const rows = [
      { id: 3, author: 'Ann', sent_at: '2026-11-10T09:02:00Z', body: 'Thanks', state: '' },
      { id: 2, author: 'Ann', sent_at: '2026-11-10T09:01:00Z', body: 'Hi', state: null },
      { id: 1, author: 'Ann', sent_at: '2026-11-10T09:00:00Z', body: 'Hello', state: 'delivered' },
    ]
    const messages = threadItems(rows, { ...fields, status: 'state' }, now).flatMap((item) => (item.kind === 'message' ? [item.status] : []))
    expect(messages).toEqual(['delivered', undefined, undefined])
  })
})
