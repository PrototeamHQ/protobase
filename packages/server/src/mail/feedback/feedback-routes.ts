import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { verifyStandardWebhook } from '../../functions/verify-signature'
import { badRequest, forbidden, HttpProblem } from '../../problem'
import { mailFeedbackBody, parseReport } from './feedback-record'
import type { FeedbackSettings } from './feedback-settings'
import { mailFeedbackSecret } from './feedback-signing'
import type { FeedbackReport } from './feedback-store'
import { resendFeedback } from './resend-feedback'
import { sesFeedback } from './ses-feedback'
import type { CertificateSource } from './sns-certificates'
import { isSnsUrl, snsMessage } from './sns-message'
import { hasSnsSignature } from './sns-signature'

/** The path of the feedback endpoints under the API's system path, such as `/api/mail/feedback`. */
export const mailFeedbackPath = (systemPath: string) => `${systemPath}/mail/feedback`

// An SNS message is at most 256 KiB; its JSON wrapping adds a little.
const reportBody = bodyLimit({
  maxSize: 300 * 1024,
  onError: () => {
    throw new HttpProblem(413, 'too-large', 'Payload Too Large', 'The body is larger than 300 KiB')
  },
})

export type FeedbackRoutesInput = {
  settings: FeedbackSettings
  /** Writes a report's records. */
  record: (report: FeedbackReport) => Promise<void>
  /** Where SNS signing certificates come from: fetched, and kept a while. */
  certificates: CertificateSource
  /** Visits an SNS subscription's confirmation link, an address on an SNS host. */
  confirm: (url: string) => Promise<void>
}

// Standard Webhooks with Svix's header names, as Resend sends them.
const asStandardWebhook = (request: Request, body: string) => {
  const headers = new Headers(request.headers)
  for (const name of ['id', 'timestamp', 'signature']) {
    const svix = request.headers.get(`svix-${name}`)
    if (svix !== null && !headers.has(`webhook-${name}`)) headers.set(`webhook-${name}`, svix)
  }
  return new Request(request.url, { method: 'POST', headers, body })
}

/**
 * The bounce and complaint reports of the mail the app sends, without sign-in, one `POST` endpoint per provider,
 * each mounted only when its setting is: `ses`, SES notifications through an SNS topic the settings name, signed by
 * SNS; `resend`, Resend's webhook, signed with its secret; and `protobase`, one normalized record signed with the key
 * derived from the platform secret. A report whose signature does not check out writes nothing: a 401, or a 403 for a
 * topic the settings do not name. Each writes one record per recipient and answers `204`, also for a kind of report
 * that is no feedback, such as a delivery, which writes nothing.
 */
export const mailFeedbackRoutes = ({ settings, record, certificates, confirm }: FeedbackRoutesInput) => {
  const app = new Hono()
  const { sesTopics, resendSecret, platformSecret } = settings

  if (sesTopics) {
    app.post('/ses', reportBody, async (c) => {
      const message = parseReport(snsMessage, await c.req.text(), 'an SNS message')
      if (!sesTopics.includes(message.TopicArn)) throw forbidden('unknown-topic', 'The SNS topic is not one PROTOBASE_MAIL_FEEDBACK_SES_TOPICS names')
      if (!(await hasSnsSignature(message, certificates))) throw new HttpProblem(401, 'invalid-signature', 'Unauthorized', 'The SNS signature does not check out')
      if (message.Type === 'SubscriptionConfirmation') {
        if (!isSnsUrl(message.SubscribeURL)) throw badRequest('invalid-subscribe-url', 'The SubscribeURL is not on an SNS host')
        await confirm(message.SubscribeURL!)
      }
      if (message.Type === 'Notification') await record({ provider: 'ses', eventId: message.MessageId, records: sesFeedback(message.Message) })
      return c.body(null, 204)
    })
  }

  if (resendSecret) {
    app.post('/resend', reportBody, async (c) => {
      const signed = asStandardWebhook(c.req.raw, await c.req.text())
      const body = await verifyStandardWebhook(signed, { secret: resendSecret })
      await record({ provider: 'resend', eventId: signed.headers.get('webhook-id')!, records: resendFeedback(body) })
      return c.body(null, 204)
    })
  }

  if (platformSecret) {
    const secret = mailFeedbackSecret(platformSecret)
    app.post('/protobase', reportBody, async (c) => {
      const body = await verifyStandardWebhook(c.req.raw, { secret })
      await record({ provider: 'protobase', eventId: c.req.header('webhook-id')!, records: [parseReport(mailFeedbackBody, body, 'a mail feedback record')] })
      return c.body(null, 204)
    })
  }

  return app
}

/** Visits an SNS subscription's confirmation link, which confirms it. */
export const confirmSnsSubscription = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' })
  if (!response.ok) throw new Error(`Confirming the SNS subscription answered ${response.status}`)
}
