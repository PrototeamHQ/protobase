import { describe, expect, it } from 'vitest'
import { messageRows, threadItems } from './thread-items'
import type { ToolCall } from './tool-calls'

const fields = { key: (row: Record<string, unknown>) => String(row.id), sender: 'author', time: 'sent_at', text: 'body' }
const now = Date.parse('2026-11-10T12:00:00Z')
const messages = (rows: Record<string, unknown>[]) => messageRows(rows, 'sent_at')

describe('threadItems', () => {
  it('shows the newest-first messages oldest first, a divider above each day and a sender’s next message that day continued', () => {
    const rows = [
      { id: 4, author: { id: '1', name: 'Ann' }, sent_at: '2026-11-10T09:01:00Z', body: 'Morning' },
      { id: 3, author: { id: '2', name: 'Bo' }, sent_at: '2026-11-10T09:00:00Z', body: 'Hi' },
      { id: 2, author: { id: '1', name: 'Ann' }, sent_at: '2026-11-08T10:05:00Z', body: null },
      { id: 1, author: { id: '1', name: 'Ann' }, sent_at: '2026-11-08T10:00:00Z', body: 'First' },
    ]
    expect(threadItems(messages(rows), fields, now).map((item) => (item.kind === 'day' ? `— ${item.label}` : item.kind === 'call' ? item.name : `${item.author.name}${item.continued ? ' (cont.)' : ''}: ${item.text}`))).toEqual([
      '— Sunday, 8 Nov 2026',
      'Ann: First',
      'Ann (cont.): ',
      '— Today',
      'Bo: Hi',
      'Ann: Morning',
    ])
  })

  it('names a sender that is no relation by its own value', () => {
    const [, message] = threadItems(messages([{ id: 1, author: 'Ann', sent_at: '2026-11-10T09:00:00Z', body: 'Hi' }]), fields, now)
    expect(message).toMatchObject({ kind: 'message', author: { id: 'Ann', name: 'Ann' }, time: '2026-11-10T09:00:00Z' })
  })

  it('gives a message with a status that status, and one without none', () => {
    const rows = [
      { id: 3, author: 'Ann', sent_at: '2026-11-10T09:02:00Z', body: 'Thanks', state: '' },
      { id: 2, author: 'Ann', sent_at: '2026-11-10T09:01:00Z', body: 'Hi', state: null },
      { id: 1, author: 'Ann', sent_at: '2026-11-10T09:00:00Z', body: 'Hello', state: 'delivered' },
    ]
    const statuses = threadItems(messages(rows), { ...fields, status: 'state' }, now).flatMap((item) => (item.kind === 'message' ? [item.status] : []))
    expect(statuses).toEqual(['delivered', undefined, undefined])
  })

  it('draws a tool call between the messages it came between, and the message after it as no continuation', () => {
    const call: ToolCall = { kind: 'call', key: 'call:1', name: 'list_tasks', time: '2026-11-10T09:00:30Z', status: 'done', state: 'done' }
    const newestFirst = [...messages([{ id: 2, author: 'Ann', sent_at: '2026-11-10T09:01:00Z', body: 'Found them' }]), call, ...messages([{ id: 1, author: 'Ann', sent_at: '2026-11-10T09:00:00Z', body: 'Looking' }])]
    expect(threadItems(newestFirst, fields, now).map((item) => (item.kind === 'day' ? 'day' : item.kind === 'call' ? `call ${item.name}` : `${item.text}${item.continued ? ' (cont.)' : ''}`))).toEqual([
      'day',
      'Looking',
      'call list_tasks',
      'Found them',
    ])
  })

  it('puts a day divider above a tool call that opens a day', () => {
    const call: ToolCall = { kind: 'call', key: 'call:1', name: 'list_tasks', time: '2026-11-10T09:00:00Z' }
    const items = threadItems([call, ...messages([{ id: 1, author: 'Ann', sent_at: '2026-11-08T09:00:00Z', body: 'Hi' }])], fields, now)
    expect(items.map((item) => item.kind)).toEqual(['day', 'message', 'day', 'call'])
    expect(items[2]).toMatchObject({ key: 'day:call:1', label: 'Today' })
  })
})
