import { webhookResources } from '@protobase/schema/internal'
import { webhooksSchema, type WebhooksOptions } from './options'

/**
 * What `webhooks` in `protobase.config.ts` adds to the app's resources: the Webhook subscriptions and Webhook deliveries
 * pages, over a `webhooks` schema that `protobase migration` writes, and the delivery log with `deliveryLog`. Who may
 * create subscriptions is the resources' access (`webhook_subscriptions.create`, ...); each delivers as its owner.
 */
export const webhooksModule = (options: WebhooksOptions = {}) => webhookResources(webhooksSchema(options), { deliveryLog: Boolean(options.deliveryLog) })
