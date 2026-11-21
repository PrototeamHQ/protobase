import { z } from 'zod'
import { badRequest } from '../../problem'

/** The kinds of feedback: the message bounced, or its recipient marked it as spam. */
export const feedbackTypes = ['bounce', 'complaint'] as const

/** Whether a bounce is permanent (`hard`) or transient (`soft`). */
export const bounceTypes = ['hard', 'soft'] as const

/**
 * One recipient's bounce or complaint, normalized from whichever provider reported it: what every endpoint writes as a
 * row of `mail.feedback`, and what the `protobase` endpoint takes as its body. A field the report does not state is
 * left out, never guessed: a bounce whose permanence the provider could not tell has no `bounce_type`.
 */
export type MailFeedback = {
  type: (typeof feedbackTypes)[number]
  bounce_type?: (typeof bounceTypes)[number]
  /** The recipient's address. */
  recipient: string
  /** The `Message-ID` header of the message it is about. */
  message_id?: string
  /** The provider's own id of that message. */
  provider_message_id?: string
  /** Why, as the provider says it: a diagnostic code, a bounce subtype or a complaint's feedback type. */
  reason?: string
  /** When the provider says it happened, as an ISO 8601 time. */
  occurred_at?: string
}

const text = z.string().trim().min(1).max(998)

/** The body the `protobase` endpoint takes: one normalized record. */
export const mailFeedbackBody = z.strictObject({
  type: z.enum(feedbackTypes),
  bounce_type: z.enum(bounceTypes).optional(),
  recipient: z.email().max(320),
  message_id: text.optional(),
  provider_message_id: text.optional(),
  reason: z.string().trim().min(1).max(10_000).optional(),
  occurred_at: z.iso.datetime({ offset: true }).optional(),
}).refine((body) => body.type === 'bounce' || body.bounce_type === undefined, { message: 'Only a bounce has a bounce_type', path: ['bounce_type'] })

/** Drops the fields whose value is missing, so a record names only what its source stated. */
export const stated = (record: { [K in keyof MailFeedback]: MailFeedback[K] | null | undefined }): MailFeedback =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== '')) as MailFeedback

const parseJson = (text: string, what: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) throw badRequest('invalid-mail-feedback', `The body is not ${what}: it is not valid JSON`)
    throw error
  }
}

/** `text` as JSON of `schema`; anything else is a 400 that names what the endpoint takes. */
export const parseReport = <T extends z.ZodType>(schema: T, text: string, what: string): z.infer<T> => {
  const parsed = schema.safeParse(parseJson(text, what))
  if (!parsed.success) throw badRequest('invalid-mail-feedback', `The body is not ${what}: ${parsed.error.issues[0]!.path.join('.') || 'body'}: ${parsed.error.issues[0]!.message}`)
  return parsed.data
}
