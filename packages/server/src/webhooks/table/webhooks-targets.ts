import { changesSchema, type EventsOptions } from '../../changes/events-options'
import { webhooksSchema, type WebhooksOptions } from './options'

/**
 * The schema modules `webhooks` needs, each with its names: the webhooks schema in the schema `options` names, whose
 * subscriptions take their owner from the change capture's actor setting in the schema `events` names, and with
 * `deliveryLog` the delivery log in that schema too.
 */
export const webhooksTargets = (options: WebhooksOptions, events?: EventsOptions) => {
  const schema = webhooksSchema(options)
  return {
    webhooks: { names: { schema, changes: changesSchema(events) }, resources: {} },
    ...(options.deliveryLog && { webhook_delivery_log: { names: { schema }, resources: {} } }),
  }
}
