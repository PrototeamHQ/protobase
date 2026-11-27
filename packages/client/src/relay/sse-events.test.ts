import { describe, expect, it } from 'vitest'
import { sseEvents } from './sse-events'

describe('sseEvents', () => {
  it('reads named and unnamed events, joins data lines and skips comments, ids and events without data', () => {
    const parse = sseEvents()
    expect(parse(': keep open\n\nevent: connection\ndata: {"a":1}\n\ndata: one\ndata:two\nid: 7\n\nevent: empty\n\n')).toEqual([
      { event: 'connection', data: '{"a":1}' },
      { event: 'message', data: 'one\ntwo' },
    ])
  })

  it('waits for the rest of a line, a `\\r\\n` split between pieces included', () => {
    const parse = sseEvents()
    expect(parse('data: hel')).toEqual([])
    expect(parse('lo\r')).toEqual([])
    expect(parse('\n\r')).toEqual([])
    expect(parse('\n')).toEqual([{ event: 'message', data: 'hello' }])
    expect(parse('data: a\rdata: b\r\r')).toEqual([])
    expect(parse('data: c\n\n')).toEqual([{ event: 'message', data: 'a\nb' }, { event: 'message', data: 'c' }])
  })
})
