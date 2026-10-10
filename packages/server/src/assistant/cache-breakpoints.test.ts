import { describe, expect, it } from 'vitest'
import { withCacheBreakpoints } from './cache-breakpoints'
import type { ChatMessage } from './chat-completions'

const messages: ChatMessage[] = [
  { role: 'system', content: 'You answer questions.' },
  { role: 'user', content: 'How many orders?' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run', arguments: '{}' } }] },
  { role: 'tool', tool_call_id: 'c1', content: [{ type: 'text', text: 'rows' }, { type: 'text', text: 'more rows' }] },
]

describe('withCacheBreakpoints', () => {
  it('ends the messages at the indexes with a breakpoint, as text parts, and leaves the others alone', () => {
    expect(withCacheBreakpoints(messages, [0, 3])).toEqual([
      { role: 'system', content: [{ type: 'text', text: 'You answer questions.', cache_control: { type: 'ephemeral' } }] },
      messages[1],
      messages[2],
      { role: 'tool', tool_call_id: 'c1', content: [{ type: 'text', text: 'rows' }, { type: 'text', text: 'more rows', cache_control: { type: 'ephemeral' } }] },
    ])
  })

  it('marks nothing on a message without text', () => {
    expect(withCacheBreakpoints(messages, [2])[2]).toBe(messages[2])
  })
})
