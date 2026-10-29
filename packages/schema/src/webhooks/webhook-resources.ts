import { f } from '../fields'
import { layout as l } from '../layout'
import { resource } from '../resource'
import { view } from '../view'

/**
 * Webhook subscriptions: a row per subscription someone made in the admin app, scoped to their tenant. Their URLs and
 * secrets let anyone call the receivers, so a role's wildcard such as `*.read` reaches none of the webhook resources.
 */
const subscriptionsResource = (schema: string) =>
  resource('webhook_subscriptions')
    .table(`${schema}.subscriptions`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      name: f.text().min(1).max(100).filterable().sortable(),
      events: f.text().min(1).max(2000),
      url: f.text().max(2000).regex(/^https?:\/\/[^\s/]+/, 'Use an http:// or https:// URL'),
      filter: f.text().optional().max(2000),
      headers: f.json().optional(),
      payload: f.enum(['full', 'thin']).default('full'),
      enabled: f.boolean().default(true).filterable(),
      secret: f.text().sensitive().readOnly().dbDefault(),
      previous_secret: null,
      previous_secret_until: null,
      tenant_id: f.text().optional().readOnly(),
      owner_id: f.text().optional().readOnly().dbDefault(),
      disabled_reason: f.text().optional().readOnly(),
      last_success_at: f.timestamp().optional().readOnly().sortable(),
      failing_since: f.timestamp().optional().readOnly(),
      created_at: f.timestamp().readOnly().dbDefault().sortable(),
      updated_at: f.timestamp().readOnly().dbDefault(),
      // Commands, which only the actions set.
      rotate_secret: f.boolean().default(false),
      send_test: f.boolean().default(false),
      resend_failed: f.boolean().default(false),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .owner((r) => r.owner_id)
    .search((r) => [r.name, r.url])
    .explicitGrants()

const subscriptionsView = view<ReturnType<typeof subscriptionsResource>>('webhook_subscriptions')
  .names({ singular: 'Webhook subscription', plural: 'Webhook subscriptions' })
  .icon('webhook')
  .title((r) => r.name)
  .help("Sends the app's events to a URL as they happen, signed with Standard Webhooks. It delivers as its owner: only the records and fields they may read.")
  .fields((r) => ({
    events: r.events.help('Event names separated by spaces, such as orders.created, or orders.* for every event of a resource'),
    url: r.url.label('URL'),
    filter: r.filter.help('Only records that match, in the language of filters: status = "paid"'),
    headers: r.headers.help('Extra request headers, as a JSON object'),
    payload: r.payload.help('Thin leaves the records out: the receiver reads them through the API').valueLabels({ full: 'Full', thin: 'Thin' }),
    secret: r.secret.help('Receivers check the webhook-signature header with it'),
    disabled_reason: r.disabled_reason.label('Disabled because'),
    last_success_at: r.last_success_at.label('Last success'),
    failing_since: r.failing_since.label('Failing since'),
  }))
  .list((r) => ({ columns: [r.name, r.events, r.url, r.enabled, r.last_success_at], sort: [[r.created_at, 'desc']] }))
  .layout((r) => [
    l.section('Subscription', [r.name, r.events, r.url, r.filter, r.payload, r.headers, r.enabled]),
    l.section('Signing', [r.secret]),
    l.sidebar([r.last_success_at, r.failing_since, r.disabled_reason, r.created_at]),
    l.related('Waiting and failed deliveries', { resource: 'webhook_deliveries', field: 'subscription_id', columns: ['event_type', 'status', 'attempt', 'next_attempt', 'last_error'] }),
  ])
  .actions((a) => [
    a.update('send_test', { label: 'Send test event', icon: 'send', set: { send_test: true } }),
    a.update('resend_failed', { label: 'Resend failed', icon: 'rotate-ccw', set: { resend_failed: true }, confirm: 'Try every failed delivery of this subscription once more?' }),
    a.update('rotate_secret', { label: 'Rotate secret', icon: 'key-round', set: { rotate_secret: true }, confirm: 'Make a new secret? The old one keeps signing too for 24 hours.' }),
    a.update('disable', { label: 'Disable', icon: 'pause', set: { enabled: false } }),
  ])

/** The deliveries of webhook subscriptions that wait for a retry or failed for good: delivery jobs, not a table. */
const deliveriesResource = (schema: string) =>
  resource('webhook_deliveries')
    .table(`${schema}.deliveries`)
    .fields({
      id: f.uuid().readOnly(),
      subscription_id: f.relation('webhook_subscriptions').readOnly().filterable(),
      tenant_id: f.text().optional().readOnly(),
      event_type: f.text().readOnly().filterable().sortable(),
      event_id: f.text().readOnly().filterable(),
      status: f.enum(['waiting', 'failed']).readOnly().filterable(),
      attempt: f.integer().readOnly(),
      next_attempt: f.timestamp().optional().readOnly().sortable(),
      last_error: f.text().optional().readOnly(),
      created_at: f.timestamp().readOnly().sortable(),
      resend: f.boolean(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .explicitGrants()
    .access({ create: () => false, delete: () => false })

const deliveriesView = view<ReturnType<typeof deliveriesResource>>('webhook_deliveries')
  .names({ singular: 'Webhook delivery', plural: 'Webhook deliveries' })
  .icon('send')
  .title((r) => r.event_type)
  .help('Deliveries that wait for their next try or failed for good. A delivery leaves the list once it succeeds.')
  .fields((r) => ({ event_type: r.event_type.label('Event'), event_id: r.event_id.label('Event id').format('code'), next_attempt: r.next_attempt.label('Next try'), last_error: r.last_error.label('Last error'), attempt: r.attempt.label('Tries') }))
  .list((r) => ({ columns: [r.event_type, r.subscription_id, r.status, r.attempt, r.next_attempt, r.last_error], sort: [[r.created_at, 'desc']] }))
  .layout((r) => [l.section('Delivery', [r.subscription_id, r.event_type, r.event_id, r.last_error]), l.sidebar([r.status, r.attempt, r.next_attempt, r.created_at])])
  .actions((a) => [a.update('resend', { label: 'Resend', icon: 'rotate-ccw', set: { resend: true }, confirm: 'Try this delivery once more, from now?' })])

/** Every try of every webhook subscription's deliveries, for 30 days (`deliveryLog: true`). */
const deliveryLogResource = (schema: string) =>
  resource('webhook_delivery_log')
    .table(`${schema}.delivery_log`)
    .fields({
      id: f.bigint().readOnly(),
      subscription_id: f.relation('webhook_subscriptions').readOnly().filterable(),
      tenant_id: f.text().optional().readOnly(),
      event_id: f.text().readOnly().filterable(),
      event_type: f.text().readOnly().filterable().sortable(),
      status: f.enum(['delivered', 'failed']).readOnly().filterable(),
      attempt: f.integer().readOnly(),
      status_code: f.integer().optional().readOnly().filterable(),
      response: f.text().optional().readOnly(),
      duration_ms: f.integer().readOnly(),
      at: f.timestamp().readOnly().filterable().sortable(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .explicitGrants()
    .access({ create: () => false, update: () => false, delete: () => false })

const deliveryLogView = view<ReturnType<typeof deliveryLogResource>>('webhook_delivery_log')
  .names({ singular: 'Webhook delivery log entry', plural: 'Webhook delivery log' })
  .icon('scroll-text')
  .title((r) => r.event_type)
  .fields((r) => ({ event_type: r.event_type.label('Event'), status_code: r.status_code.label('Status code'), duration_ms: r.duration_ms.label('Duration (ms)'), at: r.at.label('When') }))
  .list((r) => ({ columns: [r.at, r.event_type, r.subscription_id, r.status, r.status_code, r.duration_ms], sort: [[r.at, 'desc']] }))

/**
 * The resources and views `webhooks()` adds to an app, over the tables and the view of `schema`: Webhook subscriptions,
 * Webhook deliveries and, with `deliveryLog`, Webhook delivery log. Config only; the server delivers.
 */
export const webhookResources = (schema: string, { deliveryLog = false }: { deliveryLog?: boolean } = {}) => ({
  webhookSubscriptions: subscriptionsResource(schema),
  webhookSubscriptionsView: subscriptionsView,
  webhookDeliveries: deliveriesResource(schema),
  webhookDeliveriesView: deliveriesView,
  ...(deliveryLog && { webhookDeliveryLog: deliveryLogResource(schema), webhookDeliveryLogView: deliveryLogView }),
})
