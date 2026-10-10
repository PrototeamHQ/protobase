import type { AssistantCardPart, AssistantTone } from '@protobase/schema'
import type { Conversation } from './conversations'

export type ApprovalRequest = {
  title: string
  body?: string
  /** Monospace text, such as the statement that runs on approval. */
  code?: string
  fields?: Array<{ label: string; value: string }>
  tone?: AssistantTone
  badge?: string
  approveLabel?: string
  rejectLabel?: string
  /** Without an answer by then, the request is `expired`. Default 10 minutes. */
  timeoutMs?: number
}

export type ApprovalAnswer = 'approved' | 'rejected' | 'expired'

const notes = { approved: 'Approved.', rejected: 'Rejected. Nothing ran.', expired: 'Not answered in time. Nothing ran.' }

/**
 * Shows a card with Approve and Reject buttons in the assistant message `messageId` and resolves with the user's
 * answer, or `expired` after the timeout. The card then loses its buttons and says what was answered.
 */
export const requestApproval = (conversation: Conversation, messageId: string, request: ApprovalRequest) => {
  const card: AssistantCardPart = {
    type: 'card',
    id: crypto.randomUUID(),
    title: request.title,
    tone: request.tone ?? 'warning',
    ...(request.badge && { badge: request.badge }),
    ...(request.body && { body: request.body }),
    ...(request.code && { code: request.code }),
    ...(request.fields && { fields: request.fields }),
  }
  conversation.apply({
    type: 'part',
    messageId,
    part: { ...card, actions: [{ id: 'approve', label: request.approveLabel ?? 'Approve', style: 'primary' }, { id: 'reject', label: request.rejectLabel ?? 'Reject' }] },
  })
  return new Promise<ApprovalAnswer>((resolve) => {
    const answer = (value: ApprovalAnswer) => {
      clearTimeout(timer)
      stop()
      conversation.apply({ type: 'part', messageId, part: { ...card, note: notes[value] } })
      resolve(value)
    }
    const timer = setTimeout(() => answer('expired'), request.timeoutMs ?? 600_000)
    const stop = conversation.onAction(card.id, (actionId) => {
      if (actionId === 'approve' || actionId === 'reject') answer(actionId === 'approve' ? 'approved' : 'rejected')
    })
  })
}
