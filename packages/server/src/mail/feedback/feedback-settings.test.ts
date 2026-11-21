import { describe, expect, it } from 'vitest'
import { readFeedbackSettings } from './feedback-settings'

describe('the feedback settings', () => {
  it('set up each provider from its own variable', () => {
    expect(readFeedbackSettings({})).toEqual({})
    expect(readFeedbackSettings({ PROTOBASE_MAIL_FEEDBACK_SES_TOPICS: ' arn:aws:sns:eu-west-1:123456789012:bounces, arn:aws:sns:eu-west-1:123456789012:complaints ', PROTOBASE_MAIL_FEEDBACK_RESEND_SECRET: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', PROTOBASE_SECRET: 'platform' })).toEqual({
      sesTopics: ['arn:aws:sns:eu-west-1:123456789012:bounces', 'arn:aws:sns:eu-west-1:123456789012:complaints'],
      resendSecret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
      platformSecret: 'platform',
    })
  })

  it('stop startup on a topic that is not an ARN, or a secret that is not a signing secret, naming the variable', () => {
    expect(() => readFeedbackSettings({ PROTOBASE_MAIL_FEEDBACK_SES_TOPICS: 'bounces' })).toThrow(/PROTOBASE_MAIL_FEEDBACK_SES_TOPICS names "bounces"/)
    expect(() => readFeedbackSettings({ PROTOBASE_MAIL_FEEDBACK_RESEND_SECRET: 'secret' })).toThrow(/PROTOBASE_MAIL_FEEDBACK_RESEND_SECRET is not a webhook signing secret/)
  })
})
