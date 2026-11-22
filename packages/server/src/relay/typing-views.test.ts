import { describe, expect, it } from 'vitest'
import type { ViewModel } from '@protobase/schema'
import { typingViewErrors } from './typing-views'

const conversation = (resource: string, typing?: true) =>
  ({ resource, record: { conversation: { resource: 'messages', field: 'room_id', sender: 'author_id', time: 'created_at', text: 'body', ...(typing && { typing }) } } }) as unknown as ViewModel

describe('typingViewErrors', () => {
  it('passes a typing conversation on a channel resource, one without typing anywhere, and any without the relay', () => {
    expect(typingViewErrors([conversation('rooms', true), conversation('notes')], new Set(['rooms']))).toEqual([])
    expect(typingViewErrors([conversation('rooms', true), conversation('notes', true)], undefined)).toEqual([])
  })

  it('refuses typing on a resource that is no relay channel', () => {
    expect(typingViewErrors([conversation('notes', true)], new Set(['rooms']))).toEqual([expect.stringContaining('"notes" needs to be in realtime.relay.channels')])
  })
})
