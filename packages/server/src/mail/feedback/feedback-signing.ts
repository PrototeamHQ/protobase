import { hkdfSync } from 'node:crypto'
import { standardWebhookHeaders } from '../../webhooks/standard-webhooks'

/**
 * The Standard Webhooks secret of the `protobase` feedback endpoint, derived from the platform secret
 * (`PROTOBASE_SECRET`) by HKDF, so no other use of that secret signs a report and the secret itself never travels.
 */
export const mailFeedbackSecret = (platformSecret: string) => `whsec_${Buffer.from(hkdfSync('sha256', platformSecret, new Uint8Array(0), 'protobase mail feedback', 32)).toString('base64')}`

/**
 * The headers that sign a report to an app's `POST /api/mail/feedback/protobase`: `id`, unique per report and kept on
 * its retries, and the JSON `body`, signed with the key the app derives from the same platform secret.
 */
export const mailFeedbackHeaders = (platformSecret: string, id: string, body: string, now = Date.now) =>
  standardWebhookHeaders(id, Math.floor(now() / 1000), body, mailFeedbackSecret(platformSecret))
