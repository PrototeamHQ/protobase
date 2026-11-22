import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createErrorHandler } from '../../error-handler'
import { standardWebhookHeaders } from '../../webhooks/standard-webhooks'
import { mailFeedbackRoutes } from './feedback-routes'
import type { FeedbackSettings } from './feedback-settings'
import { mailFeedbackHeaders } from './feedback-signing'
import type { FeedbackReport } from './feedback-store'
import resendBounced from './testing/resend-bounced.json' with { type: 'json' }
import sesBounce from './testing/ses-bounce.json' with { type: 'json' }
import sesComplaint from './testing/ses-complaint.json' with { type: 'json' }
import sesDelivery from './testing/ses-delivery.json' with { type: 'json' }
import confirmation from './testing/sns-subscription-confirmation.json' with { type: 'json' }
import { testSnsSigner } from './testing/sns-signer'

const resendSecret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
const settings: FeedbackSettings = { sesTopics: [sesBounce.TopicArn], resendSecret, platformSecret: 'platform secret' }

const serve = (given: FeedbackSettings = settings) => {
  const reports: FeedbackReport[] = []
  const confirmed: string[] = []
  const sns = testSnsSigner()
  const app = new Hono()
  app.onError(createErrorHandler(() => {}))
  app.route('/api/mail/feedback', mailFeedbackRoutes({ settings: given, record: async (report) => void reports.push(report), certificates: sns.certificates, confirm: async (url) => void confirmed.push(url) }))
  const post = (provider: string, body: string, headers: Record<string, string> = {}) => app.request(`/api/mail/feedback/${provider}`, { method: 'POST', body, headers: { 'content-type': 'text/plain; charset=UTF-8', ...headers } })
  return { reports, confirmed, sns, post }
}

const svix = (headers: Record<string, string>) => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.replace(/^webhook-/, 'svix-'), value]))
const now = () => Math.floor(Date.now() / 1000)

describe('the SES endpoint', () => {
  it("writes an SNS notification's feedback once its signature checks out", async () => {
    const { post, sns, reports } = serve()
    const answer = await post('ses', JSON.stringify(sns.signed(sesBounce)))
    expect(answer.status).toBe(204)
    expect(reports).toEqual([{ provider: 'ses', eventId: sesBounce.MessageId, records: [expect.objectContaining({ type: 'bounce', bounce_type: 'hard', recipient: 'jane@example.com' })] }])
    expect((await post('ses', JSON.stringify(sns.signed({ ...sesComplaint, SignatureVersion: '2' })))).status).toBe(204)
    expect(reports[1]!.records).toEqual([expect.objectContaining({ type: 'complaint', recipient: 'richard@example.com' })])
    expect(sns.fetched).toEqual([sesBounce.SigningCertURL, sesBounce.SigningCertURL])
  })

  it('writes nothing for an unsigned, wrongly signed or altered notification', async () => {
    const { post, sns, reports } = serve()
    const signed = sns.signed(sesBounce)
    expect((await post('ses', JSON.stringify(sesBounce))).status).toBe(401)
    expect((await post('ses', JSON.stringify({ ...signed, Message: sesComplaint.Message }))).status).toBe(401)
    expect((await post('ses', JSON.stringify({ ...signed, SignatureVersion: '2' }))).status).toBe(401)
    expect((await post('ses', JSON.stringify(testSnsSigner().signed(sesBounce)))).status).toBe(401)
    const { Signature: _, ...unsigned } = signed
    expect((await post('ses', JSON.stringify(unsigned))).status).toBe(400)
    expect(reports).toEqual([])
  })

  it("writes nothing from a topic the settings do not name, nor fetches a certificate off SNS's hosts", async () => {
    const { post, sns, reports } = serve()
    expect((await post('ses', JSON.stringify(sns.signed({ ...sesBounce, TopicArn: 'arn:aws:sns:us-west-2:999999999999:MyTopic' })))).status).toBe(403)
    for (const url of ['https://attacker.example/SimpleNotificationService-1.pem', 'http://sns.us-west-2.amazonaws.com/SimpleNotificationService-1.pem', 'https://sns.us-west-2.amazonaws.com/other']) {
      expect((await post('ses', JSON.stringify(sns.signed({ ...sesBounce, SigningCertURL: url })))).status, url).toBe(401)
    }
    expect(sns.fetched).toEqual([])
    expect(reports).toEqual([])
  })

  it('confirms a signed subscription of a named topic at its SNS link, and nothing else', async () => {
    const { post, sns, reports, confirmed } = serve()
    expect((await post('ses', JSON.stringify(confirmation))).status).toBe(401)
    expect((await post('ses', JSON.stringify(sns.signed({ ...confirmation, SubscribeURL: 'https://attacker.example/confirm' })))).status).toBe(400)
    expect(confirmed).toEqual([])
    expect((await post('ses', JSON.stringify(sns.signed(confirmation)))).status).toBe(204)
    expect(confirmed).toEqual([confirmation.SubscribeURL])
    expect(reports).toEqual([])
  })

  it('writes no record for a delivery', async () => {
    const { post, sns, reports } = serve()
    expect((await post('ses', JSON.stringify(sns.signed(sesDelivery)))).status).toBe(204)
    expect(reports).toEqual([{ provider: 'ses', eventId: sesDelivery.MessageId, records: [] }])
  })
})

describe('the Resend endpoint', () => {
  it("writes a webhook's feedback once its signature checks out, keyed by its message id", async () => {
    const { post, reports } = serve()
    const body = JSON.stringify(resendBounced)
    expect((await post('resend', body, svix(await standardWebhookHeaders('msg_2KWPBgLlAfxdpx2AI54pPJ85f4W', now(), body, resendSecret)))).status).toBe(204)
    expect(reports).toEqual([{ provider: 'resend', eventId: 'msg_2KWPBgLlAfxdpx2AI54pPJ85f4W', records: [expect.objectContaining({ type: 'bounce', bounce_type: 'hard', recipient: 'delivered@resend.dev' })] }])
  })

  it('writes nothing for an unsigned, wrongly signed, altered or stale webhook', async () => {
    const { post, reports } = serve()
    const body = JSON.stringify(resendBounced)
    expect((await post('resend', body)).status).toBe(401)
    expect((await post('resend', body, svix(await standardWebhookHeaders('msg_1', now(), body, 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')))).status).toBe(401)
    expect((await post('resend', body.replace('delivered@', 'someone@'), svix(await standardWebhookHeaders('msg_1', now(), body, resendSecret)))).status).toBe(401)
    expect((await post('resend', body, svix(await standardWebhookHeaders('msg_1', now() - 600, body, resendSecret)))).status).toBe(401)
    expect(reports).toEqual([])
  })
})

describe('the protobase endpoint', () => {
  const record = { type: 'complaint', recipient: 'ada@example.com', message_id: '<1@shop.example.com>', reason: 'abuse' }

  it('writes a record signed with the key derived from the platform secret', async () => {
    const { post, reports } = serve()
    const body = JSON.stringify(record)
    expect((await post('protobase', body, await mailFeedbackHeaders('platform secret', 'report-1', body))).status).toBe(204)
    expect(reports).toEqual([{ provider: 'protobase', eventId: 'report-1', records: [record] }])
  })

  it('writes nothing unsigned, signed with another secret or with the platform secret itself', async () => {
    const { post, reports } = serve()
    const body = JSON.stringify(record)
    expect((await post('protobase', body)).status).toBe(401)
    expect((await post('protobase', body, await mailFeedbackHeaders('another secret', 'report-1', body))).status).toBe(401)
    expect((await post('protobase', body, { authorization: 'Bearer platform secret' })).status).toBe(401)
    expect(reports).toEqual([])
  })

  it('writes a complaint that names its message but not who complained', async () => {
    const { post, reports } = serve()
    const anonymous = { type: 'complaint', message_id: record.message_id, reason: 'abuse' }
    const body = JSON.stringify(anonymous)
    expect((await post('protobase', body, await mailFeedbackHeaders('platform secret', 'report-1', body))).status).toBe(204)
    expect(reports).toEqual([{ provider: 'protobase', eventId: 'report-1', records: [anonymous] }])
  })

  it('refuses a complaint that names neither its recipient nor its message, and a bounce without its recipient', async () => {
    const { post, reports } = serve()
    for (const wrong of [{ type: 'complaint', reason: 'abuse' }, { type: 'bounce', message_id: record.message_id }]) {
      const body = JSON.stringify(wrong)
      expect((await post('protobase', body, await mailFeedbackHeaders('platform secret', 'report-1', body))).status).toBe(400)
    }
    expect(reports).toEqual([])
  })

  it('refuses a record that is not the normalized shape', async () => {
    const { post, reports } = serve()
    for (const wrong of [{ ...record, type: 'spam' }, { ...record, bounce_type: 'hard' }, { ...record, recipient: 'not an address' }, { ...record, extra: 1 }]) {
      const body = JSON.stringify(wrong)
      expect((await post('protobase', body, await mailFeedbackHeaders('platform secret', 'report-1', body))).status).toBe(400)
    }
    expect(reports).toEqual([])
  })
})

describe('a provider without its setting', () => {
  it('has no endpoint', async () => {
    const { post } = serve({})
    for (const provider of ['ses', 'resend', 'protobase']) expect((await post(provider, '{}')).status).toBe(404)
  })
})
