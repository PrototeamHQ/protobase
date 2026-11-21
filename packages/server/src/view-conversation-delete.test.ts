import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { deleteErrors, readsDeleteCondition } from './view-conversation-delete'

const messages = resource('messages').table('messages').fields({ id: f.integer().readOnly(), reply_count: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id).toModel()

describe('deleteErrors', () => {
  it("takes delete alone, or a condition on the message's own fields", () => {
    expect(deleteErrors(true, messages)).toEqual([])
    expect(deleteErrors({ unless: 'reply_count > 0' }, messages)).toEqual([])
  })

  it('names a condition that does not parse or reads another field', () => {
    expect(deleteErrors({ unless: 'reply_count >' }, messages)[0]).toMatch(/^unless: not a valid condition/)
    expect(deleteErrors({ unless: 'channel.name = "x"' }, messages)).toEqual(['unless: names "channel.name", but it reads only fields messages has'])
  })
})

describe('readsDeleteCondition', () => {
  it('holds without a condition, and with one only for a caller who reads its fields', () => {
    expect(readsDeleteCondition(true, undefined)).toBe(true)
    expect(readsDeleteCondition({ unless: 'reply_count > 0' }, messages)).toBe(true)
    const { reply_count: _, ...fields } = messages.fields
    expect(readsDeleteCondition({ unless: 'reply_count > 0' }, { ...messages, fields })).toBe(false)
  })
})
