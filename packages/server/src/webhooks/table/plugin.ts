import { webhookResources } from '@protobase/schema'
import type { ProjectConfig } from '../../project-config'
import { webhooksSchema, type WebhooksOptions } from './options'

/**
 * Webhook subscriptions made in the admin app: `extends: [webhooks()]` in `protobase.config.ts`. It adds the Webhook
 * subscriptions and Webhook deliveries pages, over a `webhooks` schema that `protobase migration` writes. Who may
 * create subscriptions is the resources' access (`webhook_subscriptions.create`, ...); each delivers as its owner.
 */
export const webhooks = (options: WebhooksOptions = {}): ProjectConfig => {
  const schema = webhooksSchema(options)
  return {
    name: 'protobase-webhooks',
    config: webhookResources(schema, { deliveryLog: Boolean(options.deliveryLog) }),
    webhooks: options,
  }
}
