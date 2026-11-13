import { describe, expect, it } from 'vitest'
import { Thread } from '../blocks'
import { threadItemNodes, type ThreadTextItem } from '../thread-text'
import { renderText } from './render-text'

const words = { input: 'Input', result: 'Result', error: 'Error' }

const items: ThreadTextItem[] = [
  { kind: 'message', sender: 'Ann', text: 'Close task 7' },
  { kind: 'call', name: 'get_task', status: 'Done', input: { id: 7 }, result: { id: 7, state: 'open' } },
  { kind: 'call', name: 'close_task', status: 'Error', input: { id: 7 }, error: 'Task 7 is locked' },
]

describe('a thread through renderText', () => {
  it('reads its messages and tool calls under its heading, a done call with its result and an error call with its error', () => {
    const thread = Thread({ resource: 'messages', sender: 'author_id', time: 'sent_at', text: 'body', title: 'Chat' })
    expect(renderText({ ...thread, children: threadItemNodes(items, words) })).toBe(
      [
        '### [Chat](/messages)\n\n**Ann**\n\nClose task 7',
        '`get_task` · Done\n\nInput:\n\n```json\n{\n  "id": 7\n}\n```\n\nResult:\n\n```json\n{\n  "id": 7,\n  "state": "open"\n}\n```',
        '`close_task` · Error\n\nInput:\n\n```json\n{\n  "id": 7\n}\n```\n\nError:\n\n```\nTask 7 is locked\n```',
      ].join('\n\n---\n\n'),
    )
  })

  it('reads a thread without items as its heading', () => {
    expect(renderText(Thread({ resource: 'messages', sender: 'author_id', time: 'sent_at', text: 'body' }))).toBe('### [messages](/messages)')
  })
})
