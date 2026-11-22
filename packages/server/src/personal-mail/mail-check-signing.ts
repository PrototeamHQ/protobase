import { hkdfSync } from 'node:crypto'
import { standardWebhookHeaders } from '../webhooks/standard-webhooks'

/**
 * The Standard Webhooks secret an app signs its calls to the mail check service with, derived from the platform
 * secret (`PROTOBASE_SECRET`) by HKDF, so no other use of that secret signs one and the secret itself never travels.
 * The service derives the same one from the app's secret and checks a call with `verifyStandardWebhook`.
 */
export const mailCheckSecret = (platformSecret: string) => `whsec_${Buffer.from(hkdfSync('sha256', platformSecret, new Uint8Array(0), 'protobase mail alias check', 32)).toString('base64')}`

/** The headers that sign one call to the mail check service: `id`, unique per call, and the JSON `body`. */
export const mailCheckHeaders = (platformSecret: string, id: string, body: string, now = Date.now) =>
  standardWebhookHeaders(id, Math.floor(now() / 1000), body, mailCheckSecret(platformSecret))
