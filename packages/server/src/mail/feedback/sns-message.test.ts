import { describe, expect, it } from 'vitest'
import confirmation from './testing/sns-subscription-confirmation.json' with { type: 'json' }
import bounce from './testing/ses-bounce.json' with { type: 'json' }
import { isSnsUrl, snsMessage, snsStringToSign } from './sns-message'

describe('the text SNS signs', () => {
  it("is a notification's fields in order, Subject only when it has one", () => {
    const message = snsMessage.parse(bounce)
    expect(snsStringToSign(message)).toBe(`Message\n${bounce.Message}\nMessageId\n${bounce.MessageId}\nTimestamp\n${bounce.Timestamp}\nTopicArn\n${bounce.TopicArn}\nType\nNotification\n`)
    expect(snsStringToSign({ ...message, Subject: 'Bounce' })).toContain(`MessageId\n${bounce.MessageId}\nSubject\nBounce\nTimestamp\n`)
  })

  it("is a subscription confirmation's fields with its link and token", () => {
    const { Message, MessageId, SubscribeURL, Timestamp, Token, TopicArn } = confirmation
    expect(snsStringToSign(snsMessage.parse(confirmation))).toBe(`Message\n${Message}\nMessageId\n${MessageId}\nSubscribeURL\n${SubscribeURL}\nTimestamp\n${Timestamp}\nToken\n${Token}\nTopicArn\n${TopicArn}\nType\nSubscriptionConfirmation\n`)
  })
})

describe('an SNS address', () => {
  it('is https on an SNS host and nothing else', () => {
    expect(isSnsUrl(bounce.SigningCertURL)).toBe(true)
    expect(isSnsUrl('https://sns.cn-north-1.amazonaws.com.cn/cert.pem')).toBe(true)
    for (const url of ['http://sns.us-west-2.amazonaws.com/cert.pem', 'https://sns.us-west-2.amazonaws.com.evil.example/cert.pem', 'https://evil.example/sns.us-west-2.amazonaws.com/cert.pem', 'https://s3.amazonaws.com/cert.pem', 'https://sns.us-west-2.amazonaws.com:8443/cert.pem', 'https://user@sns.us-west-2.amazonaws.com/cert.pem', 'not a url', undefined]) {
      expect(isSnsUrl(url), String(url)).toBe(false)
    }
  })
})
