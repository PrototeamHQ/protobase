import { describe, expect, it, vi } from 'vitest'
import { requestApproval } from './approval'
import { createConversations, type Conversation } from './conversations'

const cardOf = (conversation: Conversation) => conversation.state().messages[0]?.parts[0]

describe('requestApproval', () => {
  it('shows a card with the labels given and resolves with the clicked answer', async () => {
    const conversation = await createConversations()('user')
    const answer = requestApproval(conversation, 'm1', { title: 'Apply the plan?', badge: '3 credits', approveLabel: 'Approve · 3 credits', rejectLabel: 'Cancel', tone: 'info' })
    const card = cardOf(conversation)
    expect(card).toMatchObject({ type: 'card', title: 'Apply the plan?', badge: '3 credits', tone: 'info', actions: [{ id: 'approve', label: 'Approve · 3 credits', style: 'primary' }, { id: 'reject', label: 'Cancel' }] })
    expect(conversation.act(card!.id, 'something-else')).toBe(true)
    expect(conversation.act(card!.id, 'approve')).toBe(true)
    await expect(answer).resolves.toBe('approved')
    expect(cardOf(conversation)).toMatchObject({ note: 'Approved.' })
    expect(cardOf(conversation)).not.toHaveProperty('actions')
    expect(conversation.act(card!.id, 'approve')).toBe(false)
  })

  it('expires without an answer', async () => {
    vi.useFakeTimers()
    const conversation = await createConversations()('user')
    const answer = requestApproval(conversation, 'm1', { title: 'Run this change?', timeoutMs: 1000 })
    vi.advanceTimersByTime(1000)
    vi.useRealTimers()
    await expect(answer).resolves.toBe('expired')
    expect(cardOf(conversation)).toMatchObject({ note: 'Not answered in time. Nothing ran.' })
    expect(conversation.act(cardOf(conversation)!.id, 'approve')).toBe(false)
  })
})
