import { describe, expect, it } from 'vitest'
import bounced from './testing/resend-bounced.json' with { type: 'json' }
import complained from './testing/resend-complained.json' with { type: 'json' }
import { resendFeedback } from './resend-feedback'

// The published Resend webhook examples.
describe('Resend feedback', () => {
  it('is a hard bounce per recipient of a permanent bounce, with its message as the reason', () => {
    expect(resendFeedback(JSON.stringify(bounced))).toEqual([
      { type: 'bounce', bounce_type: 'hard', recipient: 'delivered@resend.dev', message_id: '<111-222-333@email.example.com>', provider_message_id: '56761188-7520-42d8-8898-ff6fc54ce618', reason: bounced.data.bounce.message, occurred_at: '2026-11-22T23:41:12.126Z' },
    ])
  })

  it('is a soft bounce for a transient one, and states no bounce type for an undetermined one', () => {
    const bounceOf = (type: string) => resendFeedback(JSON.stringify({ ...bounced, data: { ...bounced.data, bounce: { ...bounced.data.bounce, type } } }))[0]
    expect(bounceOf('Transient')).toMatchObject({ bounce_type: 'soft' })
    expect(bounceOf('Temporary')).toMatchObject({ bounce_type: 'soft' })
    expect(bounceOf('Undetermined')).not.toHaveProperty('bounce_type')
  })

  it('is a complaint per recipient', () => {
    expect(resendFeedback(JSON.stringify(complained))).toEqual([
      { type: 'complaint', recipient: 'delivered@resend.dev', message_id: '<111-222-333@email.example.com>', provider_message_id: '56761188-7520-42d8-8898-ff6fc54ce618', occurred_at: '2026-02-22T23:41:12.126Z' },
    ])
  })

  it('is nothing for another event, and refuses what is not an event', () => {
    expect(resendFeedback(JSON.stringify({ ...complained, type: 'email.delivered' }))).toEqual([])
    expect(() => resendFeedback('{"type":"email.bounced"}')).toThrow(/not a Resend webhook event: data/)
  })
})
