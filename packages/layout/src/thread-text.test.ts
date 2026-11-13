import { describe, expect, it } from 'vitest'
import { threadLines, threadMarkdown, type ThreadTextItem } from './thread-text'

const words = { input: 'Input', result: 'Result', error: 'Error' }

const items: ThreadTextItem[] = [
  { kind: 'message', sender: 'Ann', time: '2026-11-10T09:00:00Z', text: 'Find my open tasks\nplease' },
  { kind: 'call', name: 'list_tasks', time: '2026-11-10T09:00:05Z', status: 'Done', input: { state: 'open' }, result: [{ id: 7 }] },
  { kind: 'call', name: 'close_task', time: '2026-11-10T09:00:09Z', status: 'Error', input: { id: 7 }, error: 'Task 7 is locked' },
  { kind: 'message', sender: 'Assistant', time: '2026-11-10T09:00:12Z', text: 'Task 7 is locked.', status: 'Sent' },
]

describe('threadLines', () => {
  it('gives each message as its sender and first line, and each tool call as its name and status', () => {
    expect(threadLines(items)).toEqual(['Ann: Find my open tasks', 'list_tasks · Done', 'close_task · Error', 'Assistant: Task 7 is locked.'])
  })

  it('gives a tool call whose status is unknown by its name alone', () => {
    expect(threadLines([{ kind: 'call', name: 'list_tasks' }])).toEqual(['list_tasks'])
  })
})

describe('threadMarkdown', () => {
  it('writes messages under their sender and tool calls with their input, result and error in code blocks', () => {
    expect(threadMarkdown(items, words)).toBe(
      [
        '**Ann** (2026-11-10T09:00:00Z)\n\nFind my open tasks\nplease',
        '`list_tasks` (2026-11-10T09:00:05Z) · Done\n\nInput:\n\n```json\n{\n  "state": "open"\n}\n```\n\nResult:\n\n```json\n[\n  {\n    "id": 7\n  }\n]\n```',
        '`close_task` (2026-11-10T09:00:09Z) · Error\n\nInput:\n\n```json\n{\n  "id": 7\n}\n```\n\nError:\n\n```\nTask 7 is locked\n```',
        '**Assistant** (2026-11-10T09:00:12Z) · Sent\n\nTask 7 is locked.',
      ].join('\n\n---\n\n'),
    )
  })

  it('leaves out what a running call does not have yet', () => {
    expect(threadMarkdown([{ kind: 'call', name: 'list_tasks', status: 'Running', input: { state: 'open' }, result: null, error: '' }], words)).toBe('`list_tasks` · Running\n\nInput:\n\n```json\n{\n  "state": "open"\n}\n```')
  })

  it('fences text holding backticks so it cannot close its block', () => {
    expect(threadMarkdown([{ kind: 'call', name: 'run`it', error: 'bad ``` fence' }], words)).toBe('`` run`it ``\n\nError:\n\n````\nbad ``` fence\n````')
  })
})
