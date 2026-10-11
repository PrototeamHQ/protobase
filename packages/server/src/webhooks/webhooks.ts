import type { Db } from '@protobase/query'
import { dispatchJobName } from '../changes/capture-sql'
import { coalesce } from '../changes/coalesce'
import { eventMatcher } from '../changes/match-events'
import { deleteOutbox, readOutbox } from '../changes/outbox'
import { resourceChange, type ResourceChange } from '../changes/resource-change'
import type { Deps } from '../deps'
import type { ApiFunction } from '../functions/define-function'
import { callerRecords } from '../functions/records'
import { defineJob } from '../jobs/define-job'
import { FatalJobError } from '../jobs/run-job'
import { attemptDelivery, type AttemptResult } from './attempt'
import { maxTries, nextRetryDelay } from './retry-schedule'
import { subscriptionProblems, subscriptionRouter } from './route-events'
import { subscriberEvents } from './subscriber-view'
import type { SubscriptionDefinition, SubscriptionEvent } from './subscription'

export type WebhooksInput = {
  deps: Deps
  subscriptions: readonly SubscriptionDefinition[]
  functions: Record<string, ApiFunction>
  /** The schema of the outbox (`EventsOptions.schema`). */
  schema: string
  /** Where each delivery's outcome is written: the server log. */
  log: (line: string) => void
}

/** A delivery waiting in the job queue: the event as its subscriber sees it, never a sensitive value. */
export type DeliveryPayload = { subscription: string; event: SubscriptionEvent; attempt: number; lastError?: string }

/**
 * The ordered deliveries of one dispatch to one subscription for one record, in commit order. One job holds them all:
 * the queue orders a group's jobs by the time of the transaction that enqueued them, which they would share.
 */
export type OrderedDeliveryPayload = { subscription: string; events: SubscriptionEvent[] }

type Delivery = { subscription: SubscriptionDefinition; event: SubscriptionEvent; change: ResourceChange }

/** Outbox rows one dispatch reads at a time. */
const batchSize = 500

/** Receivers tried at once by one dispatch. */
const parallelAttempts = 16

const mapLimit = async <T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>) => {
  const results: R[] = new Array(items.length)
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return results
}

/** The key of an unordered delivery: one waiting retry per event and subscription. */
const deliveryKey = (payload: Pick<DeliveryPayload, 'subscription' | 'event'>) => `${payload.event.id}:${payload.subscription}`

/** The group of an ordered delivery: one at a time per subscription and record. */
const deliveryGroup = ({ subscription, change }: Delivery) => `${subscription.name}:${change.resource}:${change.key}`

/**
 * Resource events delivered to the config's subscriptions, as three jobs the app's workers run:
 *
 * - `changes.dispatch`, which `capture()` enqueues once per writing transaction, in one ordered group so one runs at a
 *   time: it turns the committed outbox rows into events, makes the first try of every unordered delivery itself,
 *   queues the failures and the ordered deliveries, and deletes the rows in that same transaction. A process that dies
 *   before that commits leaves the rows, and the job's retry delivers them again, under the same `webhook-id`.
 * - `webhooks.deliver`, one try of an unordered delivery; a failure queues the next try on the Standard Webhooks
 *   schedule, or Retry-After, and the last one is kept as failed.
 * - `webhooks.deliver-ordered`, the ordered deliveries of one dispatch for one subscription and record, retried with
 *   doubling waits up to a day, holding back the record's later deliveries to that subscription meanwhile.
 *
 * No jobs without a resource with events; the subscriptions must name declared events.
 */
export const createWebhooks = ({ deps, subscriptions, functions, schema, log }: WebhooksInput) => {
  const entries = deps.registry.entries
  const models = entries.map((entry) => entry.model)
  const problems = subscriptionProblems(subscriptions, models, Object.keys(functions))
  if (problems.length > 0) throw new Error(problems.join('; '))
  if (!models.some((model) => model.events)) return { jobs: [] }

  const matchers = new Map(entries.map((entry) => [entry.name, eventMatcher(entry.model, entry.source.eventMatches?.() ?? {})]))
  const keyColumns = (resource: string) => {
    const model = deps.registry.find(resource)?.model
    return model ? model.primaryKey.map((name) => model.fields[name]!.column) : []
  }
  const route = subscriptionRouter(subscriptions, models)
  const byName = new Map(subscriptions.map((subscription) => [subscription.name, subscription]))
  const records = (session: Parameters<typeof callerRecords>[1]) => callerRecords(deps, session)
  const attempt = (subscription: SubscriptionDefinition, event: SubscriptionEvent, db: Db, tried: number, signal: AbortSignal) =>
    attemptDelivery(subscription, event, { db, functions, records, attempt: tried, signal })

  const report = (subscription: string, event: SubscriptionEvent, tried: number, result: AttemptResult) => {
    const what = `webhook ${subscription} ${event.type} ${event.id}`
    if (result.ok) log(`${what} delivered${result.status ? ` (${result.status})` : ''}${tried > 1 ? ` on try ${tried}` : ''}`)
    else log(`${what} failed on try ${tried}: ${result.error}`)
  }

  const subscriptionOf = (name: string) => {
    const found = byName.get(name)
    if (!found) throw new FatalJobError(`The subscription "${name}" no longer exists`)
    return found
  }

  const deliver = defineJob<DeliveryPayload>({
    name: 'webhooks.deliver',
    // Each try is a job of its own; the job's own retries only cover a worker that died during a try.
    maxAttempts: 3,
    retryDelay: '30 seconds',
    timeout: '1 minute',
    concurrency: parallelAttempts,
    run: async (payload, { db, signal }) => {
      const subscription = subscriptionOf(payload.subscription)
      const result = await attempt(subscription, payload.event, db, payload.attempt, signal)
      report(payload.subscription, payload.event, payload.attempt, result)
      if (result.ok) return
      const delay = result.final ? undefined : nextRetryDelay(payload.attempt, result.retryAfterMs)
      if (delay === undefined) throw new FatalJobError(result.error)
      await deliver.enqueue(db, { ...payload, attempt: payload.attempt + 1, lastError: result.error }, { key: deliveryKey(payload), delay })
    },
  })

  // A retry sends again the events of the job that went through before the one that failed, under the same ids.
  const deliverOrdered = defineJob<OrderedDeliveryPayload>({
    name: 'webhooks.deliver-ordered',
    ordered: true,
    maxAttempts: maxTries,
    retryDelay: '5 seconds',
    maxRetryDelay: '24 hours',
    timeout: '5 minutes',
    concurrency: parallelAttempts,
    run: async (payload, { db, signal, job }) => {
      const subscription = subscriptionOf(payload.subscription)
      for (const event of payload.events) {
        const result = await attempt(subscription, event, db, job.attempt, signal)
        report(payload.subscription, event, job.attempt, result)
        if (result.ok) continue
        if (result.final) throw new FatalJobError(result.error)
        throw new Error(result.error)
      }
    },
  })

  // The deliveries of a batch of outbox rows: each event of each change, to each subscription that takes it and may read it.
  const deliveriesOf = async (changes: ResourceChange[]) => {
    const eventOf = subscriberEvents(deps)
    const deliveries: Delivery[] = []
    for (const change of changes) {
      for (const { subscription, event } of route(change, matchers.get(change.resource)!(change))) {
        const shaped = await eventOf(subscription, change, event)
        if (shaped) deliveries.push({ subscription, event: shaped, change })
      }
    }
    return deliveries
  }

  const dispatchBatch = async (db: Db, signal: AbortSignal) => {
    const rows = await readOutbox(db, schema, models, batchSize)
    if (rows.length === 0) return 0
    const changes = coalesce(rows, keyColumns).flatMap((change) => {
      const entry = deps.registry.find(change.resource)
      return entry ? [resourceChange(entry.model, change)] : []
    })
    const deliveries = await deliveriesOf(changes)
    const now = deliveries.filter(({ subscription }) => !subscription.options.ordered)
    const results = await mapLimit(now, parallelAttempts, ({ subscription, event }) => attempt(subscription, event, db, 1, signal))
    await db.transaction().execute(async (trx) => {
      for (const [index, delivery] of now.entries()) {
        const result = results[index]!
        if (result.ok) continue
        const delay = result.final ? undefined : nextRetryDelay(1, result.retryAfterMs)
        if (delay === undefined) continue
        const payload = { subscription: delivery.subscription.name, event: delivery.event, attempt: 2, lastError: result.error }
        await deliver.enqueue(trx, payload, { key: deliveryKey(payload), delay })
      }
      const groups = new Map<string, OrderedDeliveryPayload>()
      for (const delivery of deliveries.filter(({ subscription }) => subscription.options.ordered)) {
        const group = deliveryGroup(delivery)
        const payload = groups.get(group) ?? { subscription: delivery.subscription.name, events: [] }
        payload.events.push(delivery.event)
        groups.set(group, payload)
      }
      for (const [group, payload] of groups) await deliverOrdered.enqueue(trx, payload, { group })
      await deleteOutbox(trx, schema, rows.map((row) => row.id))
    })
    for (const [index, { subscription, event }] of now.entries()) report(subscription.name, event, 1, results[index]!)
    return rows.length
  }

  const dispatch = defineJob({
    name: dispatchJobName,
    ordered: true,
    // A dispatch that keeps failing holds back every later one, so it keeps trying, once a minute at most.
    maxAttempts: 1_000_000,
    retryDelay: '1 second',
    maxRetryDelay: '1 minute',
    timeout: '5 minutes',
    run: async (_payload, { db, signal }) => {
      while ((await dispatchBatch(db, signal)) === batchSize && !signal.aborted);
    },
  })

  return { jobs: [dispatch, deliver, deliverOrdered] }
}
