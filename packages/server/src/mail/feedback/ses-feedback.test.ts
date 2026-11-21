import { describe, expect, it } from 'vitest'
import withoutDsn from './testing/ses-bounce-without-dsn.json' with { type: 'json' }
import bounce from './testing/ses-bounce.json' with { type: 'json' }
import complaint from './testing/ses-complaint.json' with { type: 'json' }
import delivery from './testing/ses-delivery.json' with { type: 'json' }
import { sesFeedback } from './ses-feedback'

// The published SES notification examples, as an SNS notification's Message.
describe('SES feedback', () => {
  it("is a hard bounce per bounced recipient, with the server's diagnostic as its reason", () => {
    expect(sesFeedback(bounce.Message)).toEqual([
      { type: 'bounce', bounce_type: 'hard', recipient: 'jane@example.com', message_id: 'custom-message-ID', provider_message_id: '00000138111222aa-33322211-cccc-cccc-cccc-ddddaaaa0680-000000', reason: 'smtp; 550 5.1.1 <jane@example.com>... User', occurred_at: '2016-01-27T14:59:38.237Z' },
    ])
  })

  it('takes the subtype as the reason without a diagnostic, and no Message-ID without the headers', () => {
    expect(sesFeedback(withoutDsn.Message)).toEqual(['jane@example.com', 'richard@example.com'].map((recipient) => ({ type: 'bounce', bounce_type: 'hard', recipient, provider_message_id: '00000137860315fd-34208509-5b74-41f3-95c5-22c1edc3c924-000000', reason: 'General', occurred_at: '2016-01-27T14:59:38.237Z' })))
  })

  it('is a soft bounce for a transient one, and states no bounce type for an undetermined one', () => {
    const transient = JSON.parse(withoutDsn.Message)
    transient.bounce.bounceType = 'Transient'
    expect(sesFeedback(JSON.stringify(transient))[0]).toMatchObject({ bounce_type: 'soft' })
    transient.bounce.bounceType = 'Undetermined'
    expect(sesFeedback(JSON.stringify(transient))[0]).not.toHaveProperty('bounce_type')
  })

  it("is a complaint per complained recipient, with its feedback type as the reason", () => {
    expect(sesFeedback(complaint.Message)).toEqual([
      { type: 'complaint', recipient: 'richard@example.com', message_id: 'custom-message-ID', provider_message_id: '000001378603177f-7a5433e7-8edb-42ae-af10-f0181f34d6ee-000000', reason: 'abuse', occurred_at: '2016-01-27T14:59:38.237Z' },
    ])
  })

  it('reads event publishing, which names the kind eventType', () => {
    const { notificationType: _, ...published } = JSON.parse(complaint.Message)
    expect(sesFeedback(JSON.stringify({ eventType: 'Complaint', ...published }))).toHaveLength(1)
  })

  it("takes the Message-ID header of event publishing, whose common headers carry SES's own id", () => {
    const published = JSON.parse(bounce.Message)
    published.mail.commonHeaders.messageId = published.mail.messageId
    published.mail.headers = published.mail.headers.map((header: { name: string; value: string }) => (header.name === 'Message-ID' ? { name: 'message-id', value: '<original@example.com>' } : header))
    expect(sesFeedback(JSON.stringify(published))[0]).toMatchObject({ message_id: '<original@example.com>', provider_message_id: published.mail.messageId })
    published.mail.headers = []
    expect(sesFeedback(JSON.stringify(published))[0]).not.toHaveProperty('message_id')
  })

  it('is nothing for a delivery, and refuses what is not a notification', () => {
    expect(sesFeedback(delivery.Message)).toEqual([])
    expect(() => sesFeedback('{"notificationType":"Bounce","bounce":{}}')).toThrow(/not an SES notification: bounce\.bounceType/)
    expect(() => sesFeedback('{"notificationType":')).toThrow('The body is not an SES notification: it is not valid JSON')
  })
})
