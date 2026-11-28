import { describe, expect, it } from 'vitest'
import { isLiveEntry, liveChangesOf } from './live-entry'

describe('liveChangesOf', () => {
  it('tells each change of the entry by the resource the topic follows and its address key', () => {
    const entry = { id: 'r1', cursor: 'c2', changes: [
      { resource: 'app.messages', operation: 'insert' as const, key: { id: 2 } },
      { resource: 'app.messages', operation: 'delete' as const, key: { id: 3 } },
    ] }
    expect(liveChangesOf('messages', entry)).toEqual([
      { resource: 'messages', key: '2', operation: 'create' },
      { resource: 'messages', key: '3', operation: 'delete' },
    ])
  })

  it('encodes a key of several fields as the address does', () => {
    const entry = { id: 'r1', cursor: 'c2', changes: [{ resource: 'seats', operation: 'update' as const, key: { row: 'a', seat: 4 } }] }
    expect(liveChangesOf('seats', entry)[0]!.key).toBe('a,4')
  })
})

describe('isLiveEntry', () => {
  it('takes a payload with a cursor and changes', () => {
    expect(isLiveEntry({ id: 'r1', cursor: 'c', changes: [] })).toBe(true)
    expect(isLiveEntry({ reason: 'gap' })).toBe(false)
  })
})
