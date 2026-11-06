import { webhookInputCheck, webhookInputProperties, type WebhookTrigger } from '@protobase/workflows/plugin'

/**
 * `app:webhook`: one run per call of the workflow's webhook URL that proves it comes from the sender, with the call as
 * the run's input. A sender's `webhook-id`, or the configured idempotency header, starts one run per value.
 */
export const webhookTriggers: Record<string, WebhookTrigger> = {
  webhook: {
    kind: 'webhook',
    label: 'Webhook',
    description: 'Starts one run for each call of the workflow\'s webhook URL that carries its secret; new_webhook_url issues the URL.',
    input: { type: 'object', additionalProperties: false, properties: webhookInputProperties },
    output: { type: 'object', description: '{ method, query, headers, body, received_at }: the call without its credentials; a body that makes it over 1 MiB as JSON is a file of the run' },
    check: webhookInputCheck,
    receive: async ({ event, idempotencyKey }) => ({ items: [{ ...(idempotencyKey !== undefined && { key: idempotencyKey }), data: event }] }),
  },
}
