import { describe, expect, it } from 'vitest'
import { publicationOfRow, type MessageRow } from './database-broadcasts'
import { realtimeLimits } from './realtime-limits'

const row = (fields: Partial<MessageRow> = {}): MessageRow => ({ id: 'm1', topic: 'room', event: 'INSERT', payload: { id: 'm1', record: { a: 1 } }, private: false, ...fields })

describe('publicationOfRow', () => {
  it('sends a message to its topic as the channels join it, private or public, with its id as meta', () => {
    expect(publicationOfRow(row())).toEqual({ topic: 'realtime:room', event: 'INSERT', payload: { id: 'm1', record: { a: 1 } }, private: false, meta: { id: 'm1' } })
    expect(publicationOfRow(row({ private: true }))?.private).toBe(true)
  })

  it('skips a message without a topic, event, payload or private, as Supabase does', () => {
    for (const missing of ['topic', 'event', 'payload', 'private'] as const) expect(publicationOfRow(row({ [missing]: null }))).toBeUndefined()
  })

  it('skips a message whose topic or event does not fit a frame, or whose payload is over one', () => {
    expect(publicationOfRow(row({ topic: 'x'.repeat(250) }))).toBeUndefined()
    expect(publicationOfRow(row({ event: 'x'.repeat(256) }))).toBeUndefined()
    expect(publicationOfRow(row({ payload: { text: 'x'.repeat(realtimeLimits.maxFrameBytes) } }))).toBeUndefined()
  })
})
