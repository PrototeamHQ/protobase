import { z } from 'zod'

/** The fields of an SNS message an HTTPS subscription receives, as its signature covers them. */
export const snsMessage = z.object({
  Type: z.enum(['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation']),
  MessageId: z.string(),
  TopicArn: z.string(),
  Message: z.string(),
  Timestamp: z.string(),
  SignatureVersion: z.enum(['1', '2']),
  Signature: z.string(),
  SigningCertURL: z.string(),
  Subject: z.string().optional(),
  Token: z.string().optional(),
  SubscribeURL: z.string().optional(),
})

export type SnsMessage = z.infer<typeof snsMessage>

// The keys each type signs, in this order: a notification's Subject only when it has one.
const signedKeys = (message: SnsMessage): (keyof SnsMessage)[] =>
  message.Type === 'Notification'
    ? ['Message', 'MessageId', ...(message.Subject !== undefined ? (['Subject'] as const) : []), 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']

/** The text SNS signs: each signed key and its value, on lines of their own, each line ended by a newline. */
export const snsStringToSign = (message: SnsMessage) => signedKeys(message).map((key) => `${key}\n${message[key] ?? ''}\n`).join('')

// Only SNS's own hosts serve its signing certificates and subscription links, over https.
const snsHost = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/

/** Whether `url` is an https address on an SNS host, so following it reaches SNS and nowhere else. */
export const isSnsUrl = (url: string | undefined) => {
  if (url === undefined || !URL.canParse(url)) return false
  const parsed = new URL(url)
  return parsed.protocol === 'https:' && snsHost.test(parsed.hostname) && parsed.port === '' && parsed.username === '' && parsed.password === ''
}
