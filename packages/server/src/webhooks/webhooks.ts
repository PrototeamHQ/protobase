import type { Db } from '@protobase/query'
import { dispatchJobName, isCaptured } from '../changes/capture-sql'
import { coalesce } from '../changes/coalesce'
import { EventCodeError } from '../changes/event-code-error'
import { eventMatcher } from '../changes/match-events'
import { deleteOutbox, readOutbox } from '../changes/outbox'
import { currentChange, resourceChange, type ResourceChange } from '../changes/resource-change'
import type { Deps } from '../deps'
import type { ApiFunction } from '../functions/define-function'
import { callerRecords } from '../functions/records'
import { writeHistory } from '../history/write-history'
import { defineJob } from '../jobs/define-job'
import { writeNotices } from '../live/notices-sql'
import { FatalJobError } from '../jobs/run-job'
import { attemptDelivery, type AttemptResult } from './attempt'
import { maxTries, nextRetryDelay } from './retry-schedule'
import { subscriptionProblems, subscriptionRouter } from './route-events'
import { eventChange, subscriberEvents } from './subscriber-view'
import type { SubscriptionDefinition, SubscriptionEvent } from './subscription'
import type { ChannelSender } from '../channels/channel-sender'
import { tableSubscriptionName } from './table/options'
import { sendTestJob } from './table/schema-sql'
import type { TableSubscriptions } from './table/table-subscriptions'
import { testEvent } from './test-event'

export type WebhooksInput = {
  deps: Deps
  subscriptions: readonly SubscriptionDefinition[]
  functions: Record<string, ApiFunction>
  /** What a function the subscriptions call broadcasts to record channels with. */
  channels: ChannelSender
  /** The schema of the outbox (`EventsOptions.schema`). */
  schema: string
  /** Where each delivery's outcome is written: the server log. */
  log: (line: string) => void
  /** The subscriptions people made in the admin app (`webhooks()`), and the check of their URLs' addresses. */
  table?: { subscriptions: TableSubscriptions; checkUrl?: (url: string) => Promise<string | undefined> }
}

/** A delivery waiting in the job queue: the event as its subscriber sees it, never a sensitive value. */
export type DeliveryPayload = { subscription: string; event: SubscriptionEvent; attempt: number; lastError?: string }

/**
 * The ordered deliveries of one dispatch to one subscription for one record, in commit order. One job holds them all:
 * the queue orders a group's jobs by the time of the transaction that enqueued them, which they would share.
 */
export type OrderedDeliveryPayload = { subscription: string; events: SubscriptionEvent[] }

/**
 * A change whose event code threw in dispatch. With `subscription`, only that subscription's deliveries, because its
 * access check threw; without it, the change's whole routing threw.
 */
export type DispatchChangePayload = { change: ResourceChange; subscription?: string }

type Delivery = { subscription: SubscriptionDefinition; event: SubscriptionEvent; change: ResourceChange }

/** A subscription whose access check threw on a change: its deliveries of that change are held back. */
type Failure = { change: ResourceChange; subscription: string; error: EventCodeError }

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
 *   queues the failures and the ordered deliveries, keeps the changes of resources with history, and deletes the rows
 *   in that same transaction. A process that dies
 *   before that commits leaves the rows, and the job's retry delivers them again, under the same `webhook-id`.
 * - `webhooks.dispatch-change`, one change whose app code threw in dispatch: an event's `match` or filter, a
 *   subscription's `when`, or an access rule of its roles. Kept as failed, so dispatch moves on to later changes; a
 *   retry after the fix queues the change's deliveries. An access rule's failure keeps the change for that subscription
 *   only: the others still receive it, and the retry delivers to that subscription alone. Any other error fails the
 *   whole dispatch, which is retried.
 * - `webhooks.deliver`, one try of an unordered delivery; a failure queues the next try on the Standard Webhooks
 *   schedule, or Retry-After, and the last one is kept as failed. Each try, and each of the job below, shapes its event
 *   again for the subscription as it is now, and sends nothing when it may no longer read the record.
 * - `webhooks.deliver-ordered`, the ordered deliveries of one dispatch for one subscription and record, retried with
 *   doubling waits up to a day, holding back the record's later deliveries to that subscription meanwhile.
 *
 * With `table`, also `webhooks.send-test`, which Send test event queues, and with its log `webhooks.prune-log`, daily.
 *
 * No jobs without a resource with events or history; the subscriptions must name declared events.
 */
export const createWebhooks = ({ deps, subscriptions, functions, channels, schema, log, table }: WebhooksInput) => {
  const entries = deps.registry.entries
  const models = entries.map((entry) => entry.model)
  const problems = subscriptionProblems(subscriptions, models, Object.keys(functions))
  if (problems.length > 0) throw new Error(problems.join('; '))
  if (!models.some(isCaptured)) return { jobs: [] }

  const matchers = new Map(entries.map((entry) => [entry.name, eventMatcher(entry.model, entry.source.eventMatches?.() ?? {})]))
  const keyColumns = (resource: string) => {
    const model = deps.registry.find(resource)?.model
    return model ? model.primaryKey.map((name) => model.fields[name]!.column) : []
  }
  const byName = new Map(subscriptions.map((subscription) => [subscription.name, subscription]))
  const records = (session: Parameters<typeof callerRecords>[1]) => callerRecords(deps, session)
  const tableId = (subscription: SubscriptionDefinition) => (subscription.name.startsWith('ui:') ? subscription.name.slice('ui:'.length) : undefined)

  // A try, kept on its row for a table subscription, whose URL's address is checked first.
  const attempt = async (subscription: SubscriptionDefinition, event: SubscriptionEvent, db: Db, tried: number, signal: AbortSignal) => {
    const id = tableId(subscription)
    const started = performance.now()
    const checkUrl = id === undefined ? undefined : table?.checkUrl
    const result = await attemptDelivery(subscription, event, { db, functions, records, channels, attempt: tried, signal, ...(checkUrl && { checkUrl }) })
    if (id !== undefined) await table!.subscriptions.record(db, id, event, tried, result, performance.now() - started)
    return result
  }

  // The config's subscriptions and the enabled table ones whose events and filter still check out against the resources.
  const current = async (db: Db) => {
    if (!table) return subscriptions
    const rows = (await table.subscriptions.load(db)).filter((row) => subscriptionProblems([row], models, []).length === 0)
    return [...subscriptions, ...rows]
  }

  const report = (subscription: string, event: SubscriptionEvent, tried: number, result: AttemptResult) => {
    const what = `webhook ${subscription} ${event.type} ${event.id}`
    if (result.ok) log(`${what} delivered${result.status ? ` (${result.status})` : ''}${tried > 1 ? ` on try ${tried}` : ''}`)
    else log(`${what} failed on try ${tried}: ${result.error}`)
  }

  const subscriptionOf = async (name: string, db: Db) => {
    const id = name.startsWith('ui:') ? name.slice('ui:'.length) : undefined
    const found = id === undefined ? byName.get(name) : await table?.subscriptions.find(db, id)
    if (!found) throw new FatalJobError(`The subscription "${name}" no longer exists`)
    if (found.options.enabled === false) throw new FatalJobError(`The subscription "${name}" is disabled`)
    // A table subscription as it is now, such as one whose owner holds no roles any more.
    const problems = id === undefined ? [] : subscriptionProblems([found], models, [])
    if (problems.length > 0) throw new FatalJobError(problems.join('; '))
    return found
  }

  // Without the model, which fields are sensitive is unknown: a stored change or event of a removed resource is not sent.
  const modelOf = (resource: string) => {
    const model = deps.registry.find(resource)?.model
    if (!model) throw new FatalJobError(`The resource "${resource}" no longer exists`)
    return model
  }

  // A stored event shaped again for the subscription as it is now: the fields sensitive now left out, under its current
  // access rules and roles, under the same id. `undefined` when it may not read the record any more.
  const reshaper = () => {
    const eventOf = subscriberEvents(deps)
    return async (subscription: SubscriptionDefinition, stored: SubscriptionEvent) => {
      const shaped = await eventOf(subscription, eventChange(modelOf(stored.data.resource), stored), stored.type)
      return shaped && { ...shaped, id: stored.id }
    }
  }

  const deliver = defineJob<DeliveryPayload>({
    name: 'webhooks.deliver',
    // Each try is a job of its own; the job's own retries only cover a worker that died during a try.
    maxAttempts: 3,
    retryDelay: '30 seconds',
    timeout: '1 minute',
    concurrency: parallelAttempts,
    run: async (payload, { db, signal }) => {
      const subscription = await subscriptionOf(payload.subscription, db)
      const event = await reshaper()(subscription, payload.event)
      if (!event) return
      const result = await attempt(subscription, event, db, payload.attempt, signal)
      report(payload.subscription, event, payload.attempt, result)
      if (result.ok) return
      const delay = result.final ? undefined : nextRetryDelay(payload.attempt, result.retryAfterMs)
      if (delay === undefined) throw new FatalJobError(result.error)
      await deliver.enqueue(db, { ...payload, event, attempt: payload.attempt + 1, lastError: result.error }, { key: deliveryKey(payload), delay })
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
      const subscription = await subscriptionOf(payload.subscription, db)
      // Every event shaped before the first is sent, so one that cannot be shaped sends none.
      const reshape = reshaper()
      const events: SubscriptionEvent[] = []
      for (const stored of payload.events) {
        const event = await reshape(subscription, stored)
        if (event) events.push(event)
      }
      for (const event of events) {
        const result = await attempt(subscription, event, db, job.attempt, signal)
        report(payload.subscription, event, job.attempt, result)
        if (result.ok) continue
        if (result.final) throw new FatalJobError(result.error)
        throw new Error(result.error)
      }
    },
  })

  // The deliveries of one change, against the subscriptions as they are now: each of its events, to each subscription
  // that takes it and may read it. With `only`, routed among the subscription of that name alone, so another
  // subscription's `when` is never run, and to none when no current one has it. A subscription whose access check
  // throws is a failure, with none of its deliveries of the change; the change's events and routing throw an
  // `EventCodeError` when the app's code does.
  const changeDeliveries = async (db: Db, only?: string) => {
    const all = await current(db)
    const route = subscriptionRouter(only === undefined ? all : all.filter(({ name }) => name === only), models)
    const eventOf = subscriberEvents(deps)
    return async (change: ResourceChange) => {
      const routes = route(change, matchers.get(change.resource)!(change))
      const deliveries: Delivery[] = []
      const failures: Failure[] = []
      const failed = new Set<string>()
      for (const { subscription, event } of routes) {
        if (failed.has(subscription.name)) continue
        const shaped = await eventOf(subscription, change, event).catch((error: unknown) => {
          if (!(error instanceof EventCodeError)) throw error
          failed.add(subscription.name)
          failures.push({ change, subscription: subscription.name, error })
          return undefined
        })
        if (shaped) deliveries.push({ subscription, event: shaped, change })
      }
      return { deliveries: deliveries.filter(({ subscription }) => !failed.has(subscription.name)), failures }
    }
  }

  // Ordered deliveries as one job per subscription and record.
  const queueOrdered = async (db: Db, deliveries: Delivery[]) => {
    const groups = new Map<string, OrderedDeliveryPayload>()
    for (const delivery of deliveries.filter(({ subscription }) => subscription.options.ordered)) {
      const group = deliveryGroup(delivery)
      const payload = groups.get(group) ?? { subscription: delivery.subscription.name, events: [] }
      payload.events.push(delivery.event)
      groups.set(group, payload)
    }
    for (const [group, payload] of groups) await deliverOrdered.enqueue(db, payload, { group })
  }

  // A change whose event code threw in dispatch, kept as failed on the failed jobs page; a retry after the fix queues
  // its deliveries, only to its subscription when it has one. A whole change's retry keeps each subscription whose
  // access check still throws as a failed change of its own.
  const dispatchChange = defineJob<DispatchChangePayload>({
    name: 'webhooks.dispatch-change',
    maxAttempts: 1,
    timeout: '5 minutes',
    run: async ({ change: kept, subscription: only }, { db }) => {
      const change = currentChange(modelOf(kept.resource), kept)
      const { deliveries, failures } = await (await changeDeliveries(db, only))(change)
      if (only !== undefined && failures.length > 0) throw failures[0]!.error
      await db.transaction().execute(async (trx) => {
        for (const { subscription, event } of deliveries.filter(({ subscription }) => !subscription.options.ordered)) {
          const payload = { subscription: subscription.name, event, attempt: 1 }
          await deliver.enqueue(trx, payload, { key: deliveryKey(payload) })
        }
        await queueOrdered(trx, deliveries)
        for (const { subscription } of failures) await dispatchChange.enqueue(trx, { change, subscription })
      })
    },
  })

  const dispatchBatch = async (db: Db, signal: AbortSignal) => {
    const rows = await readOutbox(db, schema, models, batchSize)
    if (rows.length === 0) return 0
    const changes = coalesce(rows, keyColumns).flatMap((change) => {
      const entry = deps.registry.find(change.resource)
      return entry ? [resourceChange(entry.model, change)] : []
    })
    const deliveriesOf = await changeDeliveries(db)
    const deliveries: Delivery[] = []
    const failures: (Omit<Failure, 'subscription'> & { subscription?: string })[] = []
    for (const change of changes) {
      try {
        const routed = await deliveriesOf(change)
        deliveries.push(...routed.deliveries)
        failures.push(...routed.failures)
      } catch (error) {
        if (!(error instanceof EventCodeError)) throw error
        failures.push({ change, error })
      }
    }
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
      await queueOrdered(trx, deliveries)
      for (const { change, subscription } of failures) await dispatchChange.enqueue(trx, { change, ...(subscription !== undefined && { subscription }) })
      await writeHistory(trx, schema, changes.filter((change) => deps.registry.find(change.resource)?.model.history))
      await writeNotices(trx, schema, changes.filter((change) => deps.registry.find(change.resource)?.model.live))
      await deleteOutbox(trx, schema, rows.map((row) => row.id))
    })
    for (const [index, { subscription, event }] of now.entries()) report(subscription.name, event, 1, results[index]!)
    for (const { error } of failures) log(`events kept as failed (webhooks.dispatch-change): ${error.message}`)
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

  // A made-up event from a current record the subscription may read, of the first resource it covers, tried once.
  const sendTest = defineJob<{ subscription: string }>({
    name: sendTestJob,
    maxAttempts: 1,
    timeout: '1 minute',
    run: async (payload, { db, signal }) => {
      const subscription = await subscriptionOf(tableSubscriptionName(payload.subscription), db)
      const event = await testEvent(deps, records, subscription)
      report(subscription.name, event, 1, await attempt(subscription, event, db, 1, signal))
    },
  })

  const pruneLog = defineJob({
    name: 'webhooks.prune-log',
    schedule: '17 3 * * *',
    run: async (_payload, { db }) => table!.subscriptions.prune(db),
  })

  return { jobs: [dispatch, dispatchChange, deliver, deliverOrdered, ...(table ? [sendTest] : []), ...(table?.subscriptions.deliveryLog ? [pruneLog] : [])] }
}
