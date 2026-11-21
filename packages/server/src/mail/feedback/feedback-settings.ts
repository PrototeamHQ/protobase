/** The providers whose reports the app takes, each from its own environment variable; one left unset has no endpoint. */
export type FeedbackSettings = {
  /** The SNS topics, by ARN, whose SES notifications are taken: `PROTOBASE_MAIL_FEEDBACK_SES_TOPICS`, separated by commas. */
  sesTopics?: string[]
  /** The signing secret of the Resend webhook endpoint, `whsec_...`: `PROTOBASE_MAIL_FEEDBACK_RESEND_SECRET`. */
  resendSecret?: string
  /** The platform secret the `protobase` endpoint's signing key is derived from: `PROTOBASE_SECRET`. */
  platformSecret?: string
}

const topicArn = /^arn:aws[a-z-]*:sns:[a-z0-9-]+:\d{12}:[\w-]+$/

/** The feedback settings from `env`; a topic that is not an SNS topic ARN stops startup, naming the variable. */
export const readFeedbackSettings = (env: Record<string, string | undefined>): FeedbackSettings => {
  const topics = env.PROTOBASE_MAIL_FEEDBACK_SES_TOPICS?.split(',').map((topic) => topic.trim()).filter((topic) => topic !== '')
  const wrong = topics?.find((topic) => !topicArn.test(topic))
  if (wrong !== undefined) throw new Error(`PROTOBASE_MAIL_FEEDBACK_SES_TOPICS names "${wrong}", which is not an SNS topic ARN such as arn:aws:sns:eu-west-1:123456789012:mail-feedback`)
  const resendSecret = env.PROTOBASE_MAIL_FEEDBACK_RESEND_SECRET
  if (resendSecret && !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(resendSecret)) throw new Error('PROTOBASE_MAIL_FEEDBACK_RESEND_SECRET is not a webhook signing secret: copy it from the webhook, whsec_ and base64')
  return {
    ...(topics && topics.length > 0 && { sesTopics: topics }),
    ...(resendSecret && { resendSecret }),
    ...(env.PROTOBASE_SECRET && { platformSecret: env.PROTOBASE_SECRET }),
  }
}
