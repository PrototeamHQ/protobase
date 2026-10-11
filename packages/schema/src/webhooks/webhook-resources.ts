import { f } from '../fields'
import { layout as l } from '../layout'
import { resource } from '../resource'
import { view } from '../view'

/** Webhook subscriptions: a row per subscription someone made in the admin app, scoped to their tenant. */
const subscriptionsResource = (schema: string) =>
  resource('webhookSubscriptions')
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
      previousSecret: null,
      previousSecretUntil: null,
      tenantId: f.text().optional().readOnly(),
      ownerId: f.text().optional().readOnly().dbDefault(),
      disabledReason: f.text().optional().readOnly(),
      lastSuccessAt: f.timestamp().optional().readOnly().sortable(),
      failingSince: f.timestamp().optional().readOnly(),
      createdAt: f.timestamp().readOnly().dbDefault().sortable(),
      updatedAt: f.timestamp().readOnly().dbDefault(),
      // Commands, which only the actions set.
      rotateSecret: f.boolean().default(false),
      sendTest: f.boolean().default(false),
      resendFailed: f.boolean().default(false),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenantId)
    .owner((r) => r.ownerId)
    .search((r) => [r.name, r.url])

const subscriptionsView = view<ReturnType<typeof subscriptionsResource>>('webhookSubscriptions')
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
    disabledReason: r.disabledReason.label('Disabled because'),
    lastSuccessAt: r.lastSuccessAt.label('Last success'),
    failingSince: r.failingSince.label('Failing since'),
  }))
  .list((r) => ({ columns: [r.name, r.events, r.url, r.enabled, r.lastSuccessAt], sort: [[r.createdAt, 'desc']] }))
  .layout((r) => [
    l.section('Subscription', [r.name, r.events, r.url, r.filter, r.payload, r.headers, r.enabled]),
    l.section('Signing', [r.secret]),
    l.sidebar([r.lastSuccessAt, r.failingSince, r.disabledReason, r.createdAt]),
    l.related('Waiting and failed deliveries', { resource: 'webhookDeliveries', field: 'subscriptionId', columns: ['eventType', 'status', 'attempt', 'nextAttempt', 'lastError'] }),
  ])
  .actions((a) => [
    a.update('sendTest', { label: 'Send test event', icon: 'send', set: { sendTest: true } }),
    a.update('resendFailed', { label: 'Resend failed', icon: 'rotate-ccw', set: { resendFailed: true }, confirm: 'Try every failed delivery of this subscription once more?' }),
    a.update('rotateSecret', { label: 'Rotate secret', icon: 'key-round', set: { rotateSecret: true }, confirm: 'Make a new secret? The old one keeps signing too for 24 hours.' }),
    a.update('disable', { label: 'Disable', icon: 'pause', set: { enabled: false } }),
  ])

/** The deliveries of webhook subscriptions that wait for a retry or failed for good: delivery jobs, not a table. */
const deliveriesResource = (schema: string) =>
  resource('webhookDeliveries')
    .table(`${schema}.deliveries`)
    .fields({
      id: f.uuid().readOnly(),
      subscriptionId: f.relation('webhookSubscriptions').readOnly().filterable(),
      tenantId: f.text().optional().readOnly(),
      eventType: f.text().readOnly().filterable().sortable(),
      eventId: f.text().readOnly().filterable(),
      status: f.enum(['waiting', 'failed']).readOnly().filterable(),
      attempt: f.integer().readOnly(),
      nextAttempt: f.timestamp().optional().readOnly().sortable(),
      lastError: f.text().optional().readOnly(),
      createdAt: f.timestamp().readOnly().sortable(),
      resend: f.boolean(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenantId)
    .access({ create: () => false, delete: () => false })

const deliveriesView = view<ReturnType<typeof deliveriesResource>>('webhookDeliveries')
  .names({ singular: 'Webhook delivery', plural: 'Webhook deliveries' })
  .icon('send')
  .title((r) => r.eventType)
  .help('Deliveries that wait for their next try or failed for good. A delivery leaves the list once it succeeds.')
  .fields((r) => ({ eventType: r.eventType.label('Event'), eventId: r.eventId.label('Event id').format('code'), nextAttempt: r.nextAttempt.label('Next try'), lastError: r.lastError.label('Last error'), attempt: r.attempt.label('Tries') }))
  .list((r) => ({ columns: [r.eventType, r.subscriptionId, r.status, r.attempt, r.nextAttempt, r.lastError], sort: [[r.createdAt, 'desc']] }))
  .layout((r) => [l.section('Delivery', [r.subscriptionId, r.eventType, r.eventId, r.lastError]), l.sidebar([r.status, r.attempt, r.nextAttempt, r.createdAt])])
  .actions((a) => [a.update('resend', { label: 'Resend', icon: 'rotate-ccw', set: { resend: true }, confirm: 'Try this delivery once more, from now?' })])

/** Every try of every webhook subscription's deliveries, for 30 days (`deliveryLog: true`). */
const deliveryLogResource = (schema: string) =>
  resource('webhookDeliveryLog')
    .table(`${schema}.delivery_log`)
    .fields({
      id: f.bigint().readOnly(),
      subscriptionId: f.relation('webhookSubscriptions').readOnly().filterable(),
      tenantId: f.text().optional().readOnly(),
      eventId: f.text().readOnly().filterable(),
      eventType: f.text().readOnly().filterable().sortable(),
      status: f.enum(['delivered', 'failed']).readOnly().filterable(),
      attempt: f.integer().readOnly(),
      statusCode: f.integer().optional().readOnly().filterable(),
      response: f.text().optional().readOnly(),
      durationMs: f.integer().readOnly(),
      at: f.timestamp().readOnly().filterable().sortable(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenantId)
    .access({ create: () => false, update: () => false, delete: () => false })

const deliveryLogView = view<ReturnType<typeof deliveryLogResource>>('webhookDeliveryLog')
  .names({ singular: 'Webhook delivery log entry', plural: 'Webhook delivery log' })
  .icon('scroll-text')
  .title((r) => r.eventType)
  .fields((r) => ({ eventType: r.eventType.label('Event'), statusCode: r.statusCode.label('Status code'), durationMs: r.durationMs.label('Duration (ms)'), at: r.at.label('When') }))
  .list((r) => ({ columns: [r.at, r.eventType, r.subscriptionId, r.status, r.statusCode, r.durationMs], sort: [[r.at, 'desc']] }))

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
