import { z } from 'zod'
import { parseReport, stated, type MailFeedback } from './feedback-record'

const recipients = z.array(z.object({ emailAddress: z.string(), diagnosticCode: z.string().optional() }))

const mail = z.object({
  messageId: z.string().optional(),
  headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  commonHeaders: z.object({ messageId: z.string().optional() }).optional(),
}).optional()

// SES writes notifications with `notificationType`, and event publishing with `eventType`; other kinds, such as a
// delivery, carry no feedback.
const notification = z.object({
  notificationType: z.string().optional(),
  eventType: z.string().optional(),
  mail,
  bounce: z.object({ bounceType: z.string(), bounceSubType: z.string().optional(), bouncedRecipients: recipients, timestamp: z.string().optional() }).optional(),
  complaint: z.object({ complainedRecipients: recipients, complaintFeedbackType: z.string().optional(), complaintSubType: z.string().nullish(), timestamp: z.string().optional() }).optional(),
})

// `Undetermined` says SES could not tell, so it states no bounce type.
const bounceType = (type: string) => (type === 'Permanent' ? 'hard' : type === 'Transient' ? 'soft' : undefined)

// The Message-ID the message was sent with. Event publishing writes SES's own id as `commonHeaders.messageId`, so a
// value equal to SES's id is not the original one, and the header itself comes first.
const originalMessageId = (sent: z.infer<typeof mail>) => {
  const header = sent?.headers?.find((candidate) => candidate.name.toLowerCase() === 'message-id')?.value
  return [header, sent?.commonHeaders?.messageId].find((id) => id !== undefined && id !== sent?.messageId)
}

/**
 * The feedback records of an SES notification, the `Message` of an SNS notification: one per bounced or complained
 * recipient, or none for another kind of notification. A body that is not an SES notification is refused.
 */
export const sesFeedback = (message: string): MailFeedback[] => {
  const parsed = parseReport(notification, message, 'an SES notification')
  const kind = parsed.notificationType ?? parsed.eventType
  const ids = { message_id: originalMessageId(parsed.mail), provider_message_id: parsed.mail?.messageId }
  if (kind === 'Bounce' && parsed.bounce) {
    const { bounce } = parsed
    return bounce.bouncedRecipients.map((recipient) =>
      stated({ type: 'bounce', bounce_type: bounceType(bounce.bounceType), recipient: recipient.emailAddress, ...ids, reason: recipient.diagnosticCode ?? bounce.bounceSubType, occurred_at: bounce.timestamp }),
    )
  }
  if (kind === 'Complaint' && parsed.complaint) {
    const { complaint } = parsed
    return complaint.complainedRecipients.map((recipient) =>
      stated({ type: 'complaint', recipient: recipient.emailAddress, ...ids, reason: complaint.complaintFeedbackType ?? complaint.complaintSubType, occurred_at: complaint.timestamp }),
    )
  }
  return []
}
