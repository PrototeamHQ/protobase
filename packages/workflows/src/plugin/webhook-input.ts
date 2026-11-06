import type { JsonSchema } from './context'

/** The largest body a webhook call may have, whatever its trigger's `body_limit` says: 10 MiB. */
export const webhookBodyCeiling = 10 * 1024 * 1024

/** The body a webhook call may have when its trigger names no `body_limit`: 1 MiB. */
export const webhookBodyDefault = 1024 * 1024

/**
 * What the route reads of every webhook trigger's input, before any plugin code sees the call: how a call proves it
 * comes from the sender (`auth`), its largest body, how many calls a minute start runs, and the header that keys a run
 * when the sender signs no `webhook-id`. A webhook type spreads these into its own input schema.
 */
export const webhookInputProperties: Record<string, JsonSchema> = {
  auth: {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    description: 'how a call proves it comes from the sender; default { "mode": "standard_webhooks" }',
    properties: {
      mode: { enum: ['standard_webhooks', 'hmac', 'bearer'], description: 'standard_webhooks: webhook-id, webhook-timestamp and webhook-signature headers; hmac: an HMAC of the body in header; bearer: Authorization: Bearer <secret>' },
      header: { type: 'string', minLength: 1, maxLength: 100, description: 'hmac: the header that carries the signature, such as x-hub-signature-256' },
      prefix: { type: 'string', maxLength: 50, description: 'hmac: text before the signature, such as sha256=' },
      encoding: { enum: ['hex', 'base64'], description: 'hmac: how the signature is written; default hex' },
      hash: { enum: ['SHA-1', 'SHA-256', 'SHA-512'], description: 'hmac: default SHA-256' },
    },
  },
  body_limit: { type: 'integer', minimum: 1, maximum: webhookBodyCeiling, description: 'the largest body in bytes; default 1048576 (1 MiB), at most 10485760 (10 MiB)' },
  per_minute: { type: 'integer', minimum: 1, maximum: 600, description: 'calls a minute that start runs; default 60' },
  idempotency_header: { type: 'string', minLength: 1, maxLength: 100, description: 'a header whose value starts one run per value, when the sender signs no webhook-id' },
}

/** What `hmac` needs beyond its mode: the header. */
export const webhookInputCheck = (input: Record<string, unknown>) => {
  const auth = input.auth as { mode?: string; header?: string } | undefined
  if (auth?.mode === 'hmac' && !auth.header) return [{ field: 'auth.header', message: 'is missing: hmac reads its signature from this header' }]
  return []
}
