import { describe, expect, it } from 'vitest'
import { applyAssistantEvent, emptyAssistantState } from './apply-event'
import type { AssistantState } from './protocol'

const question = { id: 'm1', from: 'user' as const, parts: [{ type: 'text' as const, id: 'p1', text: 'How many orders?' }] }
const state: AssistantState = { messages: [question], replying: true, status: '12 left' }

describe('applyAssistantEvent', () => {
  it('replaces everything with a state event', () => {
    expect(applyAssistantEvent(state, { type: 'state', state: emptyAssistantState })).toEqual(emptyAssistantState)
  })

  it('adds a message, or replaces the one with its id', () => {
    const answer = { id: 'm2', from: 'assistant' as const, parts: [] }
    expect(applyAssistantEvent(state, { type: 'message', message: answer }).messages).toEqual([question, answer])
    const edited = { ...question, parts: [] }
    expect(applyAssistantEvent(state, { type: 'message', message: edited }).messages).toEqual([edited])
  })

  it('adds a part, replaces the one with its id, and starts an assistant message for an unknown one', () => {
    const card = { type: 'card' as const, id: 'c1', title: 'Proposal' }
    expect(applyAssistantEvent(state, { type: 'part', messageId: 'm1', part: card }).messages[0]?.parts).toEqual([question.parts[0], card])
    expect(applyAssistantEvent(state, { type: 'part', messageId: 'm1', part: { ...question.parts[0]!, text: 'How many?' } }).messages[0]?.parts).toEqual([{ type: 'text', id: 'p1', text: 'How many?' }])
    expect(applyAssistantEvent(state, { type: 'part', messageId: 'm9', part: card }).messages[1]).toEqual({ id: 'm9', from: 'assistant', parts: [card] })
  })

  it('patches the top-level fields, null clearing one and absent keeping it', () => {
    expect(applyAssistantEvent(state, { type: 'patch', replying: false, placeholder: 'What should change?' })).toEqual({ messages: [question], replying: false, status: '12 left', placeholder: 'What should change?' })
    expect(applyAssistantEvent(state, { type: 'patch', status: null })).toEqual({ messages: [question], replying: true })
  })
})
