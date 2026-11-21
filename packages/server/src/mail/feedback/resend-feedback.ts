import { z } from 'zod'
import { parseReport, stated, type MailFeedback } from './feedback-record'

const event = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({
    email_id: z.string().optional(),
    message_id: z.string().optional(),
    to: z.array(z.string()).optional(),
    bounce: z.object({ type: z.string().optional(), subType: z.string().optional(), message: z.string().optional() }).optional(),
  }),
})

// `Undetermined` says the provider could not tell, so it states no bounce type.
const bounceType = (type: string | undefined) => (type === 'Permanent' ? 'hard' : type === 'Transient' || type === 'Temporary' ? 'soft' : undefined)

/**
 * The feedback records of a Resend webhook event: one per recipient of an `email.bounced` or `email.complained`
 * event, or none for another event. A body that is not such an event is refused.
 */
export const resendFeedback = (body: string): MailFeedback[] => {
  const { type, created_at, data } = parseReport(event, body, 'a Resend webhook event')
  const ids = { message_id: data.message_id, provider_message_id: data.email_id, occurred_at: created_at }
  if (type === 'email.bounced') return (data.to ?? []).map((recipient) => stated({ type: 'bounce', bounce_type: bounceType(data.bounce?.type), recipient, ...ids, reason: data.bounce?.message ?? data.bounce?.subType }))
  if (type === 'email.complained') return (data.to ?? []).map((recipient) => stated({ type: 'complaint', recipient, ...ids }))
  return []
}
