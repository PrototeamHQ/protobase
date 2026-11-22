import { describe, expect, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'
import { mailFeedbackBody, type MailFeedback } from './feedback-record'

type Parsed = z.output<typeof mailFeedbackBody>

// The last `refine`'s type predicate narrows the parsed body to `MailFeedback`, so a complaint with neither a recipient
// nor a message id is no parsed body, at compile time as at run time.
expectTypeOf<Parsed>().toExtend<MailFeedback>()
// @ts-expect-error A complaint names its recipient or its message.
const neither: Parsed = { type: 'complaint', reason: 'abuse' }

describe('mailFeedbackBody', () => {
  it('takes a complaint that names only its message, and refuses one that names neither', () => {
    expect(mailFeedbackBody.parse({ type: 'complaint', message_id: '<1@shop.example.com>' })).toEqual({ type: 'complaint', message_id: '<1@shop.example.com>' })
    expect(mailFeedbackBody.safeParse(neither).success).toBe(false)
  })
})
