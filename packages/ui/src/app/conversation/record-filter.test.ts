import { describe, expect, it } from 'vitest'
import { recordMessagesFilter } from './record-filter'

describe('a record conversation', () => {
  it('finds only the messages whose relation holds the record key', () => {
    expect(recordMessagesFilter('task_id', 'pb-42')).toBe('task_id = "pb-42"')
  })

  it('quotes a key that would otherwise widen the filter', () => {
    expect(recordMessagesFilter('task_id', 'a" OR task_id != "b')).toBe('task_id = "a\\" OR task_id != \\"b"')
  })
})
