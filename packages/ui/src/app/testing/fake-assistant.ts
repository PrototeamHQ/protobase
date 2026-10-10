import { applyAssistantEvent, emptyAssistantState, type AssistantCardPart, type AssistantEvent, type AssistantState } from '@protobase/schema'
import type { AssistantClient } from '@protobase/client'

/** A proposal-like card made only of generic parts: a summary, steps, a diff and two buttons. */
export const proposalCard: AssistantCardPart = {
  type: 'card',
  id: 'proposal-1',
  title: 'Add a discount to invoices',
  tone: 'info',
  badge: 'Proposal',
  body: 'Adds a discount column to invoices and shows it in the invoice list.',
  steps: [
    { label: 'Add the column invoices.discount', state: 'pending' },
    { label: 'Show it in the invoice list', state: 'pending' },
  ],
  diffs: [{ path: 'config/invoices/ui.ts', start: 8, source: '   .list((r) => ({\n-    columns: [r.number, r.customer, r.total],\n+    columns: [r.number, r.customer, r.discount, r.total],\n   }))' }],
  actions: [
    { id: 'approve', label: 'Approve', style: 'primary' },
    { id: 'revise', label: 'Ask for changes' },
  ],
}

const done = (card: AssistantCardPart): AssistantCardPart => ({ ...card, note: 'Approved. The change is applied.', steps: card.steps?.map((step) => ({ ...step, state: 'done' })), actions: [] })

export type FakeAssistantOptions = { state?: AssistantState; delayMs?: number }

/**
 * An assistant backend in memory, for stories and tests: every message is answered with `proposalCard`; Approve
 * applies it, Ask for changes asks what should change.
 */
export const fakeAssistant = ({ state: initial = emptyAssistantState, delayMs = 400 }: FakeAssistantOptions = {}): AssistantClient => {
  let state = initial
  let count = 0
  const listeners = new Set<(event: AssistantEvent) => void>()
  const emit = (event: AssistantEvent) => {
    state = applyAssistantEvent(state, event)
    for (const listener of listeners) listener(event)
  }
  const later = (run: () => void) => setTimeout(run, delayMs)

  return {
    connect: (onEvent, onConnection) => {
      listeners.add(onEvent)
      onConnection?.({ state: 'open' })
      onEvent({ type: 'state', state })
      return () => listeners.delete(onEvent)
    },
    send: async (text) => {
      count++
      emit({ type: 'message', message: { id: `user-${count}`, from: 'user', parts: [{ type: 'text', id: `user-${count}-text`, text }] } })
      emit({ type: 'patch', replying: true, placeholder: null })
      later(() => {
        emit({ type: 'message', message: { id: `reply-${count}`, from: 'assistant', parts: [{ type: 'text', id: `reply-${count}-text`, text: 'Here is what I would change.' }, { ...proposalCard, id: `proposal-${count}` }] } })
        emit({ type: 'patch', replying: false })
      })
    },
    act: async (partId, actionId) => {
      const message = state.messages.find((entry) => entry.parts.some((part) => part.id === partId))
      const card = message?.parts.find((part): part is AssistantCardPart => part.id === partId && part.type === 'card')
      if (!message || !card) throw new Error('No card waits for that action')
      if (actionId === 'revise') return emit({ type: 'patch', placeholder: 'What should change in the proposal?' })
      emit({ type: 'part', messageId: message.id, part: { ...card, actions: [], steps: card.steps?.map((step, index) => ({ ...step, state: index === 0 ? 'running' : 'pending' })) } })
      later(() => emit({ type: 'part', messageId: message.id, part: done(card) }))
    },
  }
}
