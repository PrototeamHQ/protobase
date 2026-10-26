import { describe, expect, it } from 'vitest'
import { tickets, ticketsView } from './tickets'

// The documentation shows these files; this keeps what it says about them true.

describe('the AI fields and actions of tickets', () => {
  it('fills the summary from the title and description, and runs two AI actions that write a field', async () => {
    expect(tickets.toModel().fields.summary!.ai).toEqual({ prompt: 'Summarise this support ticket in one sentence.\n\nTitle: {title}\n\n{description}' })
    expect(ticketsView.toModel().actions.map((action) => [action.name, action.run])).toEqual([
      ['translate', { kind: 'ai', prompt: 'Translate into English:\n\n{description}', writes: 'description' }],
      ['triage', { kind: 'ai', prompt: 'How urgent is this support ticket?\n\n{title}\n{description}', writes: 'priority' }],
    ])
  })
})
